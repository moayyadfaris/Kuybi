import { NestFactory } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'

import { QueueWorkerModule } from '@core/queues/worker.module'

async function bootstrap() {
  process.env.APP_MODE = 'worker'
  const appContext = await NestFactory.createApplicationContext(QueueWorkerModule, {
    bufferLogs: true
  })
  appContext.enableShutdownHooks()
  const logger = await appContext.resolve(PinoLogger)
  logger.setContext('QueueWorker')

  const shutdownTimeoutMs = parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || '30000', 10)
  let isShuttingDown = false
  let shutdownTimer: NodeJS.Timeout | undefined

  const shutdown = async (signal: string, reason?: unknown) => {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Graceful shutdown already in progress, ignoring duplicate signal')
      return
    }
    isShuttingDown = true
    logger.warn({ signal, reason }, 'Queue worker received shutdown signal')

    shutdownTimer = setTimeout(() => {
      logger.error(
        { timeoutMs: shutdownTimeoutMs },
        'Graceful shutdown timed out, forcing process exit'
      )
      process.exit(1)
    }, shutdownTimeoutMs)

    try {
      await appContext.close()
      logger.info({ signal }, 'Queue worker shutdown completed')
      if (shutdownTimer) {
        clearTimeout(shutdownTimer)
      }
      process.exit(0)
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Queue worker shutdown failed')
      if (shutdownTimer) {
        clearTimeout(shutdownTimer)
      }
      process.exit(1)
    }
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGUSR2', () => shutdown('SIGUSR2'))
  process.on('unhandledRejection', reason => shutdown('unhandledRejection', reason))
  process.on('uncaughtException', error => shutdown('uncaughtException', error))

  logger.info('🚧 Queue worker started')
}

bootstrap().catch(error => {
  console.error('Failed to start queue worker', error)
  process.exit(1)
})
