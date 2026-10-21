import { InjectQueue, Processor } from '@nestjs/bullmq'
import { errorMessage } from '@shared/utils/error.util'
import { withTimeout } from '@shared/utils/resilience'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'
import { AttachmentVisibilityService, storageKeys } from '../services/attachment-visibility.service'
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
 * uploads): strip metadata, optimize and store derivatives, all private, then apply the
 * attachment's visibility as the row holds it at the end. The owner may make the file
 * private, or delete it, while the job runs: the worker never writes the visibility, and
 * removes what it stored when the row is gone.
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
    deadLetterQueue: Queue,
    private readonly visibility: AttachmentVisibilityService
  ) {
    super(logger, deadLetterQueue)
  }

  /** Time one image may take from download to stored derivatives */
  protected processingBudgetMs = 2 * 60 * 1000

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
      // Decoding and re-encoding a hostile or huge image can hang: the job fails (and is
      // retried) instead of holding a worker slot; what it stored so far stays private
      const { prepared, metadata, thumbnailPath } = await withTimeout(async () => {
        const original = await this.s3Service.download(s3Key)
        const prepared = await this.imagePipeline.prepare(original)

        // Replaces the original (with its metadata) under the same key; private until done
        await this.s3Service.upload({
          key: s3Key,
          buffer: prepared.buffer,
          contentType: prepared.contentType,
          isPublic: false
        })
        const { metadata, thumbnailPath } = await this.imagePipeline.storeDerivatives(
          s3Key,
          prepared,
          false,
          { generateThumbnails: generateThumbnails !== false }
        )
        return { prepared, metadata, thumbnailPath }
      }, this.processingBudgetMs)

      const finished = await this.attachmentRepository.update(attachmentId, {
        size: prepared.buffer.length,
        thumbnailPath: thumbnailPath ?? attachment.thumbnailPath,
        metadata: { ...existing, ...metadata, processingStatus: 'completed' },
        mimeType: prepared.contentType,
        securityStatus: 'completed'
      })
      if (!finished) {
        // Deleted while processing: drop what this job stored
        await this.removeStored(s3Key, thumbnailPath, metadata)
        this.logger.info({ jobId: job.id, attachmentId }, 'Attachment deleted during processing')
        return { attachmentId, skipped: true }
      }
      await this.applyCurrentVisibility(attachmentId, finished)

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

  /**
   * Gives every stored object the visibility the row has now (everything was stored
   * private). Runs on the locked row, so an owner's visibility change or delete in
   * flight finishes first and its result is what gets applied; a soft-deleted file stays
   * private, and the objects of a file deleted for good are removed.
   */
  private async applyCurrentVisibility(attachmentId: string, stored: Attachment): Promise<void> {
    if ((await this.visibility.applyStoredVisibility(attachmentId)) === 'gone') {
      await this.removeStored(
        stored.path,
        stored.thumbnailPath,
        stored.metadata as AttachmentMetadata
      )
    }
  }

  private async removeStored(
    s3Key: string,
    thumbnailPath: string | undefined,
    metadata: AttachmentMetadata
  ): Promise<void> {
    const keys = storageKeys({ path: s3Key, thumbnailPath, metadata } as Attachment)
    await Promise.all(keys.map(key => this.s3Service.delete(key)))
  }
}
