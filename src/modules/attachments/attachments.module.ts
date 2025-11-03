import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import { Attachment } from './entities/attachment.entity'
import { AttachmentService } from './services/attachment.service'
import { AttachmentsController } from './controllers/attachments.controller'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { FileValidationService } from './services/file-validation.service'
import { ImageProcessingService } from './services/image-processing.service'
import { ImageOptimizationService } from './services/image-optimization.service'
import { ExifProcessorService } from './services/exif-processor.service'
import { S3Service } from './services/s3.service'
import { AclModule } from '../acl/acl.module'
import { QueueName } from '@core/queues/jobs/types'

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment]),
    AclModule,
    BullModule.registerQueue({
      name: QueueName.ATTACHMENT_PROCESSING
    })
  ],
  controllers: [AttachmentsController],
  providers: [
    AttachmentService,
    AttachmentRepository,
    FileValidationService,
    ImageProcessingService,
    ImageOptimizationService,
    ExifProcessorService,
    S3Service
  ],
  exports: [
    AttachmentService,
    AttachmentRepository,
    ImageProcessingService,
    ImageOptimizationService,
    ExifProcessorService,
    S3Service
  ]
})
export class AttachmentsModule {}
