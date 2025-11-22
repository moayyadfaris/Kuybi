import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { QueueName } from '@core/queues/jobs/types'

import { AclModule } from '../acl/acl.module'

import { AttachmentsController } from './controllers/attachments.controller'
import { Attachment } from './entities/attachment.entity'
import { AttachmentService } from './services/attachment.service'
import { ExifProcessorService } from './services/exif-processor.service'
import { FileValidationService } from './services/file-validation.service'
import { ImageOptimizationService } from './services/image-optimization.service'
import { ImageProcessingService } from './services/image-processing.service'
import { S3Service } from './services/s3.service'

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
