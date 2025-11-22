import { NestFactory } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'

import { QueueWorkerModule } from '@core/queues/worker.module'

async function bootstrap() {
  process.env.APP_MODE = 'worker'
  const appContext = await NestFactory.createApplicationContext(QueueWorkerModule, {
    bufferLogs: true
  })
  const logger = await appContext.resolve(PinoLogger)
  logger.setContext('QueueWorker')
  logger.info('🚧 Queue worker started')
}

bootstrap().catch(error => {
  console.error('Failed to start queue worker', error)
  process.exit(1)
})
