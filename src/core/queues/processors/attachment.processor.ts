import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { ExifProcessorService } from '@modules/attachments/services/exif-processor.service'
import { ImageOptimizationService } from '@modules/attachments/services/image-optimization.service'
import {
  ImageProcessingService,
  ThumbnailSize
} from '@modules/attachments/services/image-processing.service'
import { S3Service } from '@modules/attachments/services/s3.service'
import {
  AttachmentMetadata,
  mapFormatToContentType,
  resolveExtensionFromFormat,
  ThumbnailMetadata
} from '@modules/attachments/utils/attachment-image.util'

import { AttachmentRepository } from '@core/database/repositories/attachment.repository'

import { AttachmentJobType, QueueName } from '../jobs/types'

import { BaseProcessor } from './base.processor'

interface ProcessImageJobData {
  attachmentId: string
  s3Key: string
  originalName: string
  userId: string
  category?: string
  isPublic?: boolean
  generateThumbnails?: boolean
}

interface GenerateThumbnailsJobData {
  attachmentId: string
  imageUrl: string
  sizes?: Array<{ width: number; height: number; name: string }>
  isPublic?: boolean
}

interface OptimizeImageJobData {
  attachmentId: string
  buffer: Buffer
  options?: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  }
}

interface ExtractMetadataJobData {
  attachmentId: string
  buffer: Buffer
}

@Processor(QueueName.ATTACHMENT_PROCESSING, { concurrency: 5 })
export class AttachmentProcessor extends BaseProcessor {
  constructor(
    private readonly imageOptimizationService: ImageOptimizationService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly exifProcessorService: ExifProcessorService,
    private readonly s3Service: S3Service,
    private readonly attachmentRepository: AttachmentRepository,
    @InjectPinoLogger(AttachmentProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.ATTACHMENT_PROCESSING)
    private readonly attachmentQueue: Queue,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  /**
   * Central dispatch for BullMQ jobs
   */
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case AttachmentJobType.PROCESS_IMAGE:
        return this.handleProcessImage(job as Job<ProcessImageJobData>)
      case AttachmentJobType.GENERATE_THUMBNAILS:
        return this.handleGenerateThumbnails(job as Job<GenerateThumbnailsJobData>)
      case AttachmentJobType.OPTIMIZE_IMAGE:
        return this.handleOptimizeImage(job as Job<OptimizeImageJobData>)
      case AttachmentJobType.EXTRACT_METADATA:
        return this.handleExtractMetadata(job as Job<ExtractMetadataJobData>)
      default:
        this.logger.warn(
          { jobId: job.id, jobName: job.name },
          'Unknown attachment processing job received'
        )
        return { ignored: true }
    }
  }

  /**
   * Process uploaded image: EXIF stripping, optimization, thumbnail generation
   */
  private async handleProcessImage(job: Job<ProcessImageJobData>) {
    const { attachmentId, s3Key, isPublic, generateThumbnails } = job.data

    this.logger.info({ jobId: job.id, attachmentId, s3Key }, 'Processing image')

    try {
      const attachment = await this.attachmentRepository.findById(attachmentId)
      const metadata: AttachmentMetadata = {
        ...(attachment?.metadata as AttachmentMetadata)
      }

      // Step 0: Download image from S3
      const buffer = await this.s3Service.download(s3Key)

      // Step 1: Strip sensitive EXIF data
      const exifResult = await this.exifProcessorService.stripSensitiveData(buffer, {
        stripSensitiveData: true,
        preserveCopyright: true,
        preserveColorProfile: true,
        autoRotate: true
      })

      let processedBuffer = exifResult.buffer

      // Step 2: Extract safe metadata
      const summary = await this.exifProcessorService.generateMetadataSummary(buffer)

      // Step 3: Validate metadata for security
      const metadataValidation = await this.exifProcessorService.validateMetadata(buffer)
      if (!metadataValidation.valid) {
        this.logger.warn(
          { attachmentId, issues: metadataValidation.issues },
          'Image metadata validation issues detected'
        )
      }

      // Step 4: Optimize image
      const optimizationResult = await this.imageOptimizationService.optimizeImage(
        processedBuffer,
        {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 85,
          stripMetadata: true,
          autoRotate: false,
          generateWebP: true,
          generateAVIF: true,
          generatePlaceholder: true
        }
      )

      processedBuffer = optimizationResult.buffer
      const publicAccess = isPublic ?? attachment?.isPublic ?? false
      const optimizedFormat = optimizationResult.format
      const contentType = mapFormatToContentType(optimizedFormat)

      // Step 5: Upload optimized image back to S3
      await this.s3Service.upload({
        key: s3Key,
        buffer: processedBuffer,
        contentType,
        isPublic: publicAccess
      })

      let thumbnailPath: string | undefined = attachment?.thumbnailPath
      if (optimizationResult.placeholder) {
        const placeholderKey = this.s3Service.generateVariantKey(s3Key, 'placeholder', '.jpg')
        await this.s3Service.upload({
          key: placeholderKey,
          buffer: optimizationResult.placeholder,
          contentType: 'image/jpeg',
          isPublic: publicAccess
        })
        metadata.optimization = {
          ...(metadata.optimization || {}),
          placeholderKey
        }
      }

      let thumbnails: Record<string, ThumbnailMetadata> | undefined
      if (generateThumbnails !== false) {
        try {
          const thumbnailResult = await this.uploadThumbnailVariants(
            s3Key,
            processedBuffer,
            publicAccess
          )
          thumbnails = thumbnailResult.thumbnails
          if (thumbnailResult.previewKey) {
            thumbnailPath = thumbnailResult.previewKey
          }
        } catch (error) {
          this.logger.error(
            { error: error instanceof Error ? error.message : 'Unknown error', attachmentId },
            'Thumbnail variant generation failed'
          )
        }
      }

      Object.assign(metadata, summary)
      metadata.validation = metadataValidation
      metadata.optimization = {
        ...(metadata.optimization || {}),
        originalSize: optimizationResult.originalSize,
        optimizedSize: optimizationResult.size,
        compressionRatio: optimizationResult.compressionRatio,
        format: optimizationResult.format,
        width: optimizationResult.width,
        height: optimizationResult.height,
        hasWebP: !!optimizationResult.webp,
        hasAVIF: !!optimizationResult.avif,
        hasPlaceholder: !!optimizationResult.placeholder
      }

      if (thumbnails) {
        metadata.thumbnails = thumbnails
      }

      metadata.processingStatus = 'completed'

      // Step 7: Update attachment record
      await this.attachmentRepository.update(attachmentId, {
        size: processedBuffer.length,
        thumbnailPath,
        metadata,
        mimeType: contentType,
        isPublic: publicAccess,
        securityStatus: 'completed'
      })

      const result = {
        attachmentId,
        originalSize: optimizationResult.originalSize,
        optimizedSize: optimizationResult.size,
        compressionRatio: optimizationResult.compressionRatio,
        thumbnailGenerated: !!thumbnailPath,
        thumbnails: thumbnails ? Object.keys(thumbnails).length : 0,
        metadata: Object.keys(metadata).length
      }

      this.logger.info(result, 'Image processing completed')
      return result
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', attachmentId },
        'Image processing failed'
      )

      // Update attachment record with failed status
      try {
        await this.attachmentRepository.update(attachmentId, {
          securityStatus: 'failed',
          metadata: {
            processingStatus: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date().toISOString()
          }
        })
      } catch (updateError) {
        this.logger.error(
          { updateError: updateError instanceof Error ? updateError.message : 'Unknown' },
          'Failed to update attachment with error status'
        )
      }

      throw error
    }
  }

  /**
   * Generate multiple thumbnail sizes
   */
  private async handleGenerateThumbnails(job: Job<GenerateThumbnailsJobData>) {
    const { attachmentId, imageUrl, sizes, isPublic } = job.data

    this.logger.info({ jobId: job.id, attachmentId }, 'Generating thumbnails')

    try {
      // Download image from S3
      const imageBuffer = await this.s3Service.download(imageUrl)
      const attachment = await this.attachmentRepository.findById(attachmentId)
      const publicAccess = isPublic ?? attachment?.isPublic ?? false

      const thumbnailSizes: ThumbnailSize[] | undefined = sizes
        ? sizes.map(size => ({
            name: size.name,
            width: size.width,
            height: size.height,
            fit: size.height ? 'cover' : 'inside'
          }))
        : undefined

      const thumbnailResult = await this.uploadThumbnailVariants(
        imageUrl,
        imageBuffer,
        publicAccess,
        thumbnailSizes
      )

      const metadata: AttachmentMetadata = {
        ...(attachment?.metadata as AttachmentMetadata)
      }
      metadata.thumbnails = thumbnailResult.thumbnails

      await this.attachmentRepository.update(attachmentId, {
        metadata,
        thumbnailPath: thumbnailResult.previewKey ?? attachment?.thumbnailPath
      })

      const thumbnailsCount = Object.keys(thumbnailResult.thumbnails).length
      this.logger.info({ attachmentId, count: thumbnailsCount }, 'Thumbnails generated')
      return { attachmentId, thumbnails: thumbnailsCount }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', attachmentId },
        'Thumbnail generation failed'
      )
      throw error
    }
  }

  /**
   * Optimize existing image
   */
  private async handleOptimizeImage(job: Job<OptimizeImageJobData>) {
    const { attachmentId, buffer, options } = job.data

    this.logger.info({ jobId: job.id, attachmentId }, 'Optimizing image')

    try {
      const result = await this.imageOptimizationService.optimizeImage(buffer, {
        maxWidth: options?.maxWidth || 2048,
        maxHeight: options?.maxHeight || 2048,
        quality: options?.quality || 85,
        stripMetadata: true,
        generateWebP: true,
        generateAVIF: false
      })

      this.logger.info(
        {
          attachmentId,
          originalSize: result.originalSize,
          optimizedSize: result.size,
          ratio: result.compressionRatio
        },
        'Image optimization completed'
      )

      return {
        attachmentId,
        originalSize: result.originalSize,
        optimizedSize: result.size,
        compressionRatio: result.compressionRatio
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', attachmentId },
        'Image optimization failed'
      )
      throw error
    }
  }

  /**
   * Extract metadata from image
   */
  private async handleExtractMetadata(job: Job<ExtractMetadataJobData>) {
    const { attachmentId, buffer } = job.data

    this.logger.info({ jobId: job.id, attachmentId }, 'Extracting metadata')

    try {
      const metadata = await this.exifProcessorService.generateMetadataSummary(buffer)
      const validation = await this.exifProcessorService.validateMetadata(buffer)

      await this.attachmentRepository.update(attachmentId, {
        metadata: {
          ...metadata,
          validation: {
            valid: validation.valid,
            issuesCount: validation.issues.length
          }
        }
      })

      this.logger.info({ attachmentId, fields: Object.keys(metadata).length }, 'Metadata extracted')
      return { attachmentId, metadata, validation }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', attachmentId },
        'Metadata extraction failed'
      )
      throw error
    }
  }

  /**
   * Enqueue image processing job (called from API)
   */
  async enqueueProcessImage(data: ProcessImageJobData) {
    await this.attachmentQueue.add(AttachmentJobType.PROCESS_IMAGE, data, {
      priority: 5,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 3000
      }
    })
  }

  /**
   * Enqueue thumbnail generation
   */
  async enqueueGenerateThumbnails(data: GenerateThumbnailsJobData) {
    await this.attachmentQueue.add(AttachmentJobType.GENERATE_THUMBNAILS, data)
  }

  /**
   * Enqueue image optimization
   */
  async enqueueOptimizeImage(data: OptimizeImageJobData) {
    await this.attachmentQueue.add(AttachmentJobType.OPTIMIZE_IMAGE, data)
  }

  /**
   * Enqueue metadata extraction
   */
  async enqueueExtractMetadata(data: ExtractMetadataJobData) {
    await this.attachmentQueue.add(AttachmentJobType.EXTRACT_METADATA, data)
  }

  private async uploadThumbnailVariants(
    baseKey: string,
    buffer: Buffer,
    isPublic: boolean,
    sizes?: ThumbnailSize[]
  ): Promise<{ thumbnails: Record<string, ThumbnailMetadata>; previewKey?: string }> {
    const generated = await this.imageProcessingService.generateThumbnails(buffer, sizes)
    const thumbnails: Record<string, ThumbnailMetadata> = {}

    await Promise.all(
      Object.entries(generated).map(async ([variant, data]) => {
        const extension = resolveExtensionFromFormat(data.format)
        const key = this.s3Service.generateVariantKey(baseKey, variant, extension)

        await this.s3Service.upload({
          key,
          buffer: data.buffer,
          contentType: mapFormatToContentType(data.format),
          isPublic
        })

        thumbnails[variant] = {
          key,
          width: data.width,
          height: data.height,
          size: data.size,
          format: data.format
        }
      })
    )

    const previewPriority = ['medium', 'large', 'small', 'preview']
    let previewKey: string | undefined

    for (const variant of previewPriority) {
      const entry = thumbnails[variant]
      if (entry) {
        previewKey = entry.key
        break
      }
    }

    if (!previewKey) {
      const first = Object.values(thumbnails)[0]
      previewKey = first?.key
    }

    return { thumbnails, previewKey }
  }
}
