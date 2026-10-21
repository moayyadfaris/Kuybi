import { BadRequestException, Injectable } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import sharp, { type Sharp } from 'sharp'

import { IMAGE_OPERATION_TIMEOUT } from '../utils/attachment-image.util'

export interface OptimizationOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  stripMetadata?: boolean
  autoRotate?: boolean
  generatePlaceholder?: boolean
}

export interface OptimizationResult {
  buffer: Buffer
  format: string
  width: number
  height: number
  size: number
  originalSize: number
  compressionRatio: number
  placeholder?: Buffer
}

/**
 * Resizes and recompresses an image (PNG stays PNG for transparency, everything else
 * becomes JPEG) and makes a tiny blurred placeholder for progressive loading
 */
@Injectable()
export class ImageOptimizationService {
  private readonly defaultQuality = 85
  private readonly placeholderWidth = 20
  constructor(
    @InjectPinoLogger(ImageOptimizationService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Optimize image with smart compression and format conversion
   */
  async optimizeImage(
    buffer: Buffer,
    options: OptimizationOptions = {}
  ): Promise<OptimizationResult> {
    try {
      const originalSize = buffer.length
      let image = sharp(buffer).timeout(IMAGE_OPERATION_TIMEOUT)

      // Get metadata
      const metadata = await image.metadata()

      // Auto-rotate based on EXIF orientation
      if (options.autoRotate !== false) {
        image = image.rotate()
      }

      // sharp output carries no EXIF/XMP/IPTC by default. withMetadata({ exif: {} }) used to
      // be here: it KEEPS the input's metadata (GPS included) and merges into it.
      image = options.stripMetadata ? image.keepIccProfile() : image.keepMetadata()

      // Resize if needed
      if (options.maxWidth || options.maxHeight) {
        image = image.resize({
          width: options.maxWidth,
          height: options.maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        })
      }

      // Apply smart compression based on format
      const quality = options.quality || this.defaultQuality
      const optimized = await this.applySmartCompression(image, metadata.format, quality)

      const optimizedMetadata = await sharp(optimized).metadata()

      const result: OptimizationResult = {
        buffer: optimized,
        format: optimizedMetadata.format || 'jpeg',
        width: optimizedMetadata.width || 0,
        height: optimizedMetadata.height || 0,
        size: optimized.length,
        originalSize,
        compressionRatio: parseFloat(((1 - optimized.length / originalSize) * 100).toFixed(2))
      }

      // Generate tiny placeholder for lazy loading
      if (options.generatePlaceholder !== false) {
        result.placeholder = await this.generatePlaceholder(buffer)
      }

      this.logger.info(
        {
          originalSize,
          optimizedSize: result.size,
          compressionRatio: result.compressionRatio,
          format: result.format
        },
        'Image optimized successfully'
      )

      return result
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to optimize image')
      throw new BadRequestException('Failed to optimize image')
    }
  }

  /**
   * Generate tiny blurred placeholder for lazy loading (LQIP - Low Quality Image Placeholder)
   */
  async generatePlaceholder(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .timeout(IMAGE_OPERATION_TIMEOUT)
        .rotate()
        .resize(this.placeholderWidth, null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .blur(2)
        .jpeg({ quality: 20, progressive: false })
        .toBuffer()
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to generate placeholder')
      throw new BadRequestException('Failed to generate placeholder')
    }
  }

  /**
   * Apply smart compression based on image format and content
   */
  private async applySmartCompression(
    image: Sharp,
    format: string | undefined,
    quality: number
  ): Promise<Buffer> {
    const targetFormat = this.selectBestFormat(format)

    switch (targetFormat) {
      case 'jpeg':
        return await image
          .jpeg({
            quality,
            progressive: true,
            mozjpeg: true
          })
          .toBuffer()

      case 'png':
        return await image
          .png({
            quality,
            compressionLevel: 9,
            adaptiveFiltering: true
          })
          .toBuffer()

      default:
        // Default to JPEG
        return await image.jpeg({ quality, progressive: true }).toBuffer()
    }
  }

  /**
   * Select best format for optimization
   */
  private selectBestFormat(originalFormat: string | undefined): 'jpeg' | 'png' {
    if (!originalFormat) return 'jpeg'

    // Keep PNG for images with transparency
    if (originalFormat === 'png') return 'png'

    // Convert everything else to JPEG
    return 'jpeg'
  }
}
