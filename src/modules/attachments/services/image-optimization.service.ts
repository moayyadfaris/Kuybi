import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { errorMessage } from '@shared/utils/error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import sharp, { type Sharp } from 'sharp'

export interface ImageFormat {
  format: 'jpeg' | 'png' | 'webp' | 'avif'
  quality: number
  progressive?: boolean
  compressionLevel?: number
}

export interface OptimizationOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  stripMetadata?: boolean
  autoRotate?: boolean
  generateWebP?: boolean
  generateAVIF?: boolean
  generatePlaceholder?: boolean
  formats?: ImageFormat[]
}

export interface OptimizationResult {
  buffer: Buffer
  format: string
  width: number
  height: number
  size: number
  originalSize: number
  compressionRatio: number
  webp?: Buffer
  avif?: Buffer
  placeholder?: Buffer
}

@Injectable()
export class ImageOptimizationService {
  private readonly defaultQuality = 85
  private readonly placeholderWidth = 20
  constructor(
    private readonly configService: ConfigService,
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
      let image = sharp(buffer)

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

      // Generate WebP version
      if (options.generateWebP !== false) {
        result.webp = await sharp(buffer)
          .rotate()
          .resize({
            width: options.maxWidth,
            height: options.maxHeight,
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: quality - 5 })
          .toBuffer()

        this.logger.debug({ originalSize, webpSize: result.webp.length }, 'Generated WebP version')
      }

      // Generate AVIF version (next-gen format)
      if (options.generateAVIF) {
        try {
          result.avif = await sharp(buffer)
            .rotate()
            .resize({
              width: options.maxWidth,
              height: options.maxHeight,
              fit: 'inside',
              withoutEnlargement: true
            })
            .avif({ quality: quality - 10 })
            .toBuffer()

          this.logger.debug(
            { originalSize, avifSize: result.avif.length },
            'Generated AVIF version'
          )
        } catch {
          this.logger.warn('Failed to generate AVIF format, skipping')
        }
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
   * Convert image to specific format with optimization
   */
  async convertFormat(
    buffer: Buffer,
    targetFormat: 'jpeg' | 'png' | 'webp' | 'avif',
    quality = this.defaultQuality
  ): Promise<Buffer> {
    try {
      const image = sharp(buffer).rotate()

      switch (targetFormat) {
        case 'jpeg':
          return await image.jpeg({ quality, progressive: true }).toBuffer()
        case 'png':
          return await image.png({ quality, compressionLevel: 9 }).toBuffer()
        case 'webp':
          return await image.webp({ quality }).toBuffer()
        case 'avif':
          return await image.avif({ quality }).toBuffer()
        default:
          throw new BadRequestException(`Unsupported format: ${targetFormat}`)
      }
    } catch (error) {
      this.logger.error({ error: errorMessage(error), targetFormat }, 'Format conversion failed')
      throw new BadRequestException(`Failed to convert to ${targetFormat}`)
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

      case 'webp':
        return await image
          .webp({
            quality: quality - 5,
            effort: 6
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
  private selectBestFormat(originalFormat: string | undefined): 'jpeg' | 'png' | 'webp' {
    if (!originalFormat) return 'jpeg'

    // Keep PNG for images with transparency
    if (originalFormat === 'png') return 'png'

    // Convert everything else to JPEG
    return 'jpeg'
  }

  /**
   * Get image dimensions without loading full image
   */
  async getDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    const metadata = await sharp(buffer).metadata()
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    }
  }
}
