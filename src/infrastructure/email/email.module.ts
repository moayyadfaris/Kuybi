import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { EmailService } from './services/email.service'
import { EmailTemplateService } from './services/email-template.service'
import { EmailQueueService } from './services/email-queue.service'
import { EmailTestController } from './controllers/email-test.controller'
import { EmailQueueTestController } from './controllers/email-queue-test.controller'
import { QueueName } from '@core/queues/jobs/types'

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
