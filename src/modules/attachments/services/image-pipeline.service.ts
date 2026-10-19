import { Injectable } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'

import {
  AttachmentMetadata,
  mapFormatToContentType,
  resolveExtensionFromFormat,
  ThumbnailMetadata
} from '../utils/attachment-image.util'

import { ExifProcessorService } from './exif-processor.service'
import { ImageOptimizationService } from './image-optimization.service'
import { ImageProcessingService } from './image-processing.service'
import { S3Service } from './s3.service'

/** An image ready to store: metadata stripped, oriented, optimized */
export interface PreparedImage {
  buffer: Buffer
  format: string
  contentType: string
  /** Safe summary, validation and optimization details (never coordinates) */
  metadata: AttachmentMetadata
  placeholder?: Buffer
}

export interface StoredDerivatives {
  /** Key of the preview thumbnail, when thumbnails were generated */
  thumbnailPath?: string
  metadata: AttachmentMetadata
}

/**
 * The one image pipeline, used by the multipart upload (in the request) and by the
 * attachment processor (for direct uploads): strip EXIF/XMP/IPTC, apply orientation,
 * optimize, then store the placeholder and thumbnails next to the original.
 */
@Injectable()
export class ImagePipelineService {
  constructor(
    private readonly exif: ExifProcessorService,
    private readonly optimizer: ImageOptimizationService,
    private readonly thumbnails: ImageProcessingService,
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(ImagePipelineService.name)
  }

  /**
   * Prepares an uploaded image for storage. Throws if the image cannot be processed:
   * callers must not fall back to storing the original, which still carries its metadata
   * (GPS location, camera details).
   */
  async prepare(original: Buffer): Promise<PreparedImage> {
    const stripped = await this.exif.stripSensitiveData(original, {
      stripSensitiveData: true,
      preserveColorProfile: true,
      autoRotate: true
    })
    const summary = await this.exif.generateMetadataSummary(original)
    const validation = await this.exif.validateMetadata(original)
    if (!validation.valid) {
      this.logger.warn({ issues: validation.issues }, 'Image metadata validation issues detected')
    }

    const optimized = await this.optimizer.optimizeImage(stripped.buffer, {
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 85,
      stripMetadata: true,
      autoRotate: false, // already applied while stripping
      // WebP/AVIF copies were encoded and thrown away (nothing stores or serves them)
      generateWebP: false,
      generateAVIF: false,
      generatePlaceholder: true
    })

    return {
      buffer: optimized.buffer,
      format: optimized.format,
      contentType: mapFormatToContentType(optimized.format),
      placeholder: optimized.placeholder,
      metadata: {
        ...(summary as AttachmentMetadata),
        validation,
        optimization: {
          originalSize: optimized.originalSize,
          optimizedSize: optimized.size,
          compressionRatio: optimized.compressionRatio,
          format: optimized.format,
          width: optimized.width,
          height: optimized.height,
          hasPlaceholder: !!optimized.placeholder
        }
      }
    }
  }

  /**
   * Stores the placeholder and (optionally) thumbnails of a stored image. Thumbnail
   * failures are logged and skipped: the original is already usable without them.
   */
  async storeDerivatives(
    baseKey: string,
    image: PreparedImage,
    isPublic: boolean,
    options: { generateThumbnails?: boolean } = {}
  ): Promise<StoredDerivatives> {
    const metadata: AttachmentMetadata = { ...image.metadata }

    if (image.placeholder) {
      const placeholderKey = this.s3Service.generateVariantKey(baseKey, 'placeholder', '.jpg')
      await this.s3Service.upload({
        key: placeholderKey,
        buffer: image.placeholder,
        contentType: 'image/jpeg',
        isPublic
      })
      metadata.optimization = { ...(metadata.optimization || {}), placeholderKey }
    }

    if (options.generateThumbnails === false) {
      return { metadata }
    }

    try {
      const { thumbnails, previewKey } = await this.uploadThumbnails(
        baseKey,
        image.buffer,
        isPublic
      )
      metadata.thumbnails = thumbnails
      return { metadata, thumbnailPath: previewKey }
    } catch (error) {
      this.logger.error({ error: errorMessage(error), baseKey }, 'Thumbnail generation failed')
      return { metadata }
    }
  }

  private async uploadThumbnails(
    baseKey: string,
    buffer: Buffer,
    isPublic: boolean
  ): Promise<{ thumbnails: Record<string, ThumbnailMetadata>; previewKey?: string }> {
    const generated = await this.thumbnails.generateThumbnails(buffer)
    const thumbnails: Record<string, ThumbnailMetadata> = {}

    await Promise.all(
      Object.entries(generated).map(async ([variant, data]) => {
        const key = this.s3Service.generateVariantKey(
          baseKey,
          variant,
          resolveExtensionFromFormat(data.format)
        )
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

    const preview =
      ['medium', 'large', 'small', 'preview'].find(variant => thumbnails[variant]) ??
      Object.keys(thumbnails)[0]
    return { thumbnails, previewKey: preview ? thumbnails[preview].key : undefined }
  }
}
