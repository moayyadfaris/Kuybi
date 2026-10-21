import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { errorMessage, errorStack } from '@shared/utils/error.util'
import { Request, Response } from 'express'
import { Logger } from 'nestjs-pino'

import { initTracing, shutdownTracing } from '@core/observability/otel-sdk'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'

// Initialize tracing before anything else
initTracing()

interface HttpConfig {
  host: string
  port: number
  swaggerEnabled: boolean
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const configService = app.get(ConfigService)
  const httpConfig = configService.get<HttpConfig>('http', {
    host: '0.0.0.0',
    port: 4040,
    swaggerEnabled: false
  })

  // Set Pino as the application logger
  const appLogger = app.get(Logger)
  app.useLogger(appLogger)

  configureApp(app)

  // API docs: on in development/test, opt-in elsewhere (SWAGGER_ENABLED=true)
  if (httpConfig.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Kuybi API')
      .setDescription('Kuybi admin and public web API')
      .setVersion('1.0.0')
      .addServer(`http://${httpConfig.host}:${httpConfig.port}`)
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/swagger.json'
    })

    app.use('/api/swagger.json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json')
      res.send(document)
    })
  }

  // Signal handling is done below (shutdown()), which calls app.close() and so runs all
  // lifecycle hooks. Do NOT add enableShutdownHooks(): Nest would close the app a second
  // time in parallel and re-raise the signal, killing the process mid-shutdown.

  await app.listen(httpConfig.port, httpConfig.host)
  // PM2 (wait_ready) routes traffic to this instance only after it listens
  process.send?.('ready')

  let isShuttingDown = false
  let shutdownTimer: NodeJS.Timeout | null = null

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      appLogger.log({ signal }, 'Shutdown already in progress, ignoring duplicate signal')
      return
    }
    isShuttingDown = true

    appLogger.log({ signal }, 'Received shutdown signal, starting graceful shutdown')

    // Set a timeout to force shutdown if graceful shutdown takes too long
    const shutdownTimeout = 30000 // 30 seconds
    shutdownTimer = setTimeout(() => {
      appLogger.error(
        { signal, timeout: shutdownTimeout },
        'Graceful shutdown timeout exceeded, forcing exit'
      )
      process.exit(1)
    }, shutdownTimeout)

    try {
      // Stop accepting new requests
      appLogger.log({ signal }, 'Stopping new incoming requests')

      // Close the NestJS application (triggers onModuleDestroy, beforeApplicationShutdown, onApplicationShutdown)
      appLogger.log({ signal }, 'Closing Nest application and connections')
      await app.close()

      // Flush remaining spans once no more requests can produce them
      await shutdownTracing()

      appLogger.log({ signal }, 'All connections closed successfully')

      // Clear the timeout since shutdown completed successfully
      if (shutdownTimer) {
        clearTimeout(shutdownTimer)
      }

      appLogger.log({ signal }, 'Graceful shutdown completed')
      process.exit(0)
    } catch (error) {
      appLogger.error(
        { signal, error: errorMessage(error), stack: errorStack(error) },
        'Error during graceful shutdown'
      )

      // Clear the timeout
      if (shutdownTimer) {
        clearTimeout(shutdownTimer)
      }

      // Exit with error code
      process.exit(1)
    }
  }

  // Handle termination signals
  process.once('SIGINT', () => shutdown('SIGINT')) // Ctrl+C
  process.once('SIGTERM', () => shutdown('SIGTERM')) // Docker/K8s termination
  process.once('SIGUSR2', () => shutdown('SIGUSR2')) // Nodemon restart

  // Handle uncaught errors
  process.on('uncaughtException', (error: Error) => {
    appLogger.error(
      { error: error.message, stack: error.stack },
      'Uncaught exception - shutting down'
    )
    shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    appLogger.error({ reason, promise }, 'Unhandled promise rejection - shutting down')
    shutdown('unhandledRejection')
  })
}

bootstrap()
