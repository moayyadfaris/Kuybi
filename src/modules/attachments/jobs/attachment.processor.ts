import { InjectQueue, Processor } from '@nestjs/bullmq'
import { errorMessage } from '@shared/utils/error.util'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { AttachmentRepository } from '../repositories/attachment.repository'
import { ImagePipelineService } from '../services/image-pipeline.service'
import { S3Service } from '../services/s3.service'
import { AttachmentMetadata } from '../utils/attachment-image.util'

export interface ProcessImageJobData {
  attachmentId: string
  s3Key: string
  originalName: string
  userId: string
  category?: string
  /** Visibility when queued; the row's current value is what gets applied */
  isPublic?: boolean
  generateThumbnails?: boolean
}

/**
 * Processes uploaded images in the worker (direct uploads and async multipart
 * uploads): strip metadata, optimize, store derivatives, then publish with the
 * attachment's current visibility. Until then the original stays private.
 */
@Processor(QueueName.ATTACHMENT_PROCESSING, { concurrency: 5 })
export class AttachmentProcessor extends BaseProcessor {
  constructor(
    private readonly imagePipeline: ImagePipelineService,
    private readonly s3Service: S3Service,
    private readonly attachmentRepository: AttachmentRepository,
    @InjectPinoLogger(AttachmentProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case AttachmentJobType.PROCESS_IMAGE:
        return this.handleProcessImage(job as Job<ProcessImageJobData>)
      default:
        this.logger.warn(
          { jobId: job.id, jobName: job.name },
          'Unknown attachment processing job received'
        )
        return { ignored: true }
    }
  }

  private async handleProcessImage(job: Job<ProcessImageJobData>) {
    const { attachmentId, s3Key, generateThumbnails } = job.data
    this.logger.info({ jobId: job.id, attachmentId, s3Key }, 'Processing image')

    // Fresh read: the visibility may have changed while the job waited
    const attachment = await this.attachmentRepository.findById(attachmentId, {
      bypassCache: true
    })
    if (!attachment || attachment.deletedAt) {
      // Deleted while the job waited: nothing to publish
      this.logger.info({ jobId: job.id, attachmentId }, 'Attachment gone, image not processed')
      return { attachmentId, skipped: true }
    }
    const existing = { ...(attachment.metadata as AttachmentMetadata) }

    try {
      const original = await this.s3Service.download(s3Key)
      const prepared = await this.imagePipeline.prepare(original)
      const publicAccess = attachment.isPublic

      // Replaces the original (with its metadata) under the same key
      await this.s3Service.upload({
        key: s3Key,
        buffer: prepared.buffer,
        contentType: prepared.contentType,
        isPublic: publicAccess
      })
      const { metadata, thumbnailPath } = await this.imagePipeline.storeDerivatives(
        s3Key,
        prepared,
        publicAccess,
        { generateThumbnails: generateThumbnails !== false }
      )

      await this.attachmentRepository.update(attachmentId, {
        size: prepared.buffer.length,
        thumbnailPath: thumbnailPath ?? attachment.thumbnailPath,
        metadata: { ...existing, ...metadata, processingStatus: 'completed' },
        mimeType: prepared.contentType,
        isPublic: publicAccess,
        securityStatus: 'completed'
      })

      const result = {
        attachmentId,
        originalSize: prepared.metadata.optimization?.originalSize,
        optimizedSize: prepared.buffer.length,
        thumbnails: Object.keys(metadata.thumbnails ?? {}).length
      }
      this.logger.info(result, 'Image processing completed')
      return result
    } catch (error) {
      this.logger.error({ error: errorMessage(error), attachmentId }, 'Image processing failed')

      // The original stays private; record the failure without losing earlier metadata
      try {
        await this.attachmentRepository.update(attachmentId, {
          securityStatus: 'failed',
          metadata: {
            ...existing,
            processingStatus: 'failed',
            error: errorMessage(error),
            failedAt: new Date().toISOString()
          }
        })
      } catch (updateError) {
        this.logger.error(
          { updateError: errorMessage(updateError), attachmentId },
          'Failed to update attachment with error status'
        )
      }
      throw error
    }
  }
}
