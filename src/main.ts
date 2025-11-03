import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger, PinoLogger } from 'nestjs-pino'
import { ConfigService } from '@nestjs/config'
import helmet from 'helmet'
import * as compression from 'compression'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from '@shared/filters/http-exception.filter'
import { TransformInterceptor } from '@shared/interceptors/transform.interceptor'
import { LoggingContextService } from '@core/logging/logging-context.service'
import { LoggingContextInterceptor } from '@core/logging/logging-context.interceptor'
import { RequestIdInterceptor } from '@shared/interceptors/request-id.interceptor'
import { SentryService, SentryInterceptor, SentryFilter } from '@core/sentry'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const configService = app.get(ConfigService)
  const httpConfig = configService.get('http', {
    host: '0.0.0.0',
    port: 4040,
    corsOrigin: '*'
  })
  const compressionConfig = configService.get('compression', {
    enabled: true,
    threshold: 1024,
    level: 6
  })

  // Set Pino as the application logger
  const appLogger = app.get(Logger)
  app.useLogger(appLogger)

  // Get Sentry service for conditional middleware
  const sentryService = app.get(SentryService)

  app.use(helmet())

  // Response compression middleware with optimized settings
  if (compressionConfig.enabled) {
    app.use(
      compression({
        filter: (req, res) => {
          // Don't compress responses with this request header
          if (req.headers['x-no-compression']) {
            return false
          }
          // Fallback to standard filter function
          return compression.filter(req, res)
        },
        threshold: compressionConfig.threshold,
        level: compressionConfig.level
      })
    )
  }

  app.enableCors({ origin: httpConfig.corsOrigin, credentials: true })
  app.setGlobalPrefix('api')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )
  const pinoLogger = appLogger as unknown as PinoLogger
  app.useGlobalFilters(new HttpExceptionFilter(pinoLogger, configService))

  const loggingContextService = app.get(LoggingContextService)

  // Register global interceptors (Sentry first for error tracking)
  const globalInterceptors = [new RequestIdInterceptor()]

  if (sentryService.isEnabled()) {
    globalInterceptors.push(new SentryInterceptor(sentryService))
  }

  globalInterceptors.push(
    new LoggingContextInterceptor(loggingContextService, configService),
    new TransformInterceptor()
  )

  app.useGlobalInterceptors(...globalInterceptors)

  // Register Sentry global filter (must be before other filters)
  if (sentryService.isEnabled()) {
    app.useGlobalFilters(new SentryFilter(sentryService))
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kuybi Countries API')
    .setDescription('Country listing endpoints for the NestJS scaffold')
    .setVersion('1.0.0')
    .addServer(`http://${httpConfig.host}:${httpConfig.port}`)
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/swagger.json'
  })

  app.use('/api/swagger.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(document)
  })

  await app.listen(httpConfig.port, httpConfig.host)
}

bootstrap()
