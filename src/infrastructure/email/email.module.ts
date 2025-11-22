import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { QueueName } from '@core/queues/jobs/types'

import { EmailQueueTestController } from './controllers/email-queue-test.controller'
import { EmailTestController } from './controllers/email-test.controller'
import { EmailService } from './services/email.service'
import { EmailQueueService } from './services/email-queue.service'
import { EmailTemplateService } from './services/email-template.service'

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: QueueName.EMAIL
    })
  ],
  controllers: [EmailTestController, EmailQueueTestController],
  providers: [EmailService, EmailTemplateService, EmailQueueService],
  exports: [EmailService, EmailTemplateService, EmailQueueService]
})
export class EmailModule {}
