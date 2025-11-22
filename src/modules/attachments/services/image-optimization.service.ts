import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as sharp from 'sharp'

export interface ImageFormat {
  format: 'jpeg' | 'png' | 'webp' | 'avif'
  quality: number
  progressive?: boolean
  compressionLevel?: number
}

export interface ResponsiveImageSet {
  original: Buffer
  webp: Buffer
  avif?: Buffer
  sizes: {
    [key: string]: {
      jpeg: Buffer
      webp?: Buffer
      avif?: Buffer
      width: number
      height: number
    }
  }
  placeholder: Buffer // Tiny blurred image for lazy loading
  metadata: sharp.Metadata
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
  private readonly defaultFormats: ImageFormat[] = [
    { format: 'jpeg', quality: 85, progressive: true },
    { format: 'webp', quality: 80 },
    { format: 'avif', quality: 75 }
  ]

  // Responsive breakpoints for different devices
  private readonly responsiveBreakpoints = [
    { name: 'thumbnail', width: 150, height: 150 },
    { name: 'small', width: 320 },
    { name: 'medium', width: 640 },
    { name: 'large', width: 1024 },
    { name: 'xlarge', width: 1920 }
  ]

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

      // Strip metadata if requested (privacy/security)
      if (options.stripMetadata) {
        image = image.withMetadata({
          exif: {}
        })
      }

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
        } catch (error) {
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
      this.logger.error({ error: error.message }, 'Failed to optimize image')
      throw new BadRequestException('Failed to optimize image')
    }
  }

  /**
   * Generate responsive image set for different screen sizes
   */
  async generateResponsiveSet(
    buffer: Buffer,
    options: {
      breakpoints?: Array<{ name: string; width: number; height?: number }>
      generateWebP?: boolean
      generateAVIF?: boolean
      quality?: number
    } = {}
  ): Promise<ResponsiveImageSet> {
    try {
      const metadata = await sharp(buffer).metadata()
      const breakpoints = options.breakpoints || this.responsiveBreakpoints
      const quality = options.quality || this.defaultQuality

      const result: ResponsiveImageSet = {
        original: buffer,
        webp: await sharp(buffer).webp({ quality }).toBuffer(),
        sizes: {},
        placeholder: await this.generatePlaceholder(buffer),
        metadata
      }

      // Generate AVIF for original if enabled
      if (options.generateAVIF) {
        try {
          result.avif = await sharp(buffer)
            .avif({ quality: quality - 10 })
            .toBuffer()
        } catch (error) {
          this.logger.warn('AVIF generation failed for original')
        }
      }

      // Generate all breakpoint sizes
      for (const breakpoint of breakpoints) {
        const sizeResult: {
          jpeg: Buffer
          webp?: Buffer
          avif?: Buffer
          width: number
          height: number
        } = {
          jpeg: Buffer.from([]),
          width: 0,
          height: 0
        }

        // JPEG version
        sizeResult.jpeg = await sharp(buffer)
          .rotate()
          .resize({
            width: breakpoint.width,
            height: breakpoint.height,
            fit: breakpoint.height ? 'cover' : 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality, progressive: true })
          .toBuffer()

        // WebP version
        if (options.generateWebP !== false) {
          sizeResult.webp = await sharp(buffer)
            .rotate()
            .resize({
              width: breakpoint.width,
              height: breakpoint.height,
              fit: breakpoint.height ? 'cover' : 'inside',
              withoutEnlargement: true
            })
            .webp({ quality: quality - 5 })
            .toBuffer()
        }

        // AVIF version
        if (options.generateAVIF) {
          try {
            sizeResult.avif = await sharp(buffer)
              .rotate()
              .resize({
                width: breakpoint.width,
                height: breakpoint.height,
                fit: breakpoint.height ? 'cover' : 'inside',
                withoutEnlargement: true
              })
              .avif({ quality: quality - 10 })
              .toBuffer()
          } catch (error) {
            this.logger.warn(`AVIF generation failed for ${breakpoint.name}`)
          }
        }

        const sizeMetadata = await sharp(sizeResult.jpeg).metadata()
        sizeResult.width = sizeMetadata.width || breakpoint.width
        sizeResult.height = sizeMetadata.height || 0

        result.sizes[breakpoint.name] = sizeResult
      }

      this.logger.info(
        { breakpointsGenerated: Object.keys(result.sizes).length },
        'Responsive image set generated'
      )

      return result
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to generate responsive set')
      throw new BadRequestException('Failed to generate responsive image set')
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
      this.logger.error({ error: error.message }, 'Failed to generate placeholder')
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
      this.logger.error({ error: error.message, targetFormat }, 'Format conversion failed')
      throw new BadRequestException(`Failed to convert to ${targetFormat}`)
    }
  }

  /**
   * Apply smart compression based on image format and content
   */
  private async applySmartCompression(
    image: sharp.Sharp,
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
   * Batch optimize multiple images
   */
  async batchOptimize(
    images: Array<{ buffer: Buffer; name: string }>,
    options: OptimizationOptions = {}
  ): Promise<Array<{ name: string; result: OptimizationResult }>> {
    const results = []

    for (const image of images) {
      try {
        const result = await this.optimizeImage(image.buffer, options)
        results.push({ name: image.name, result })
      } catch (error) {
        this.logger.error({ name: image.name, error: error.message }, 'Batch optimization failed')
        // Continue with next image
      }
    }

    return results
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

  /**
   * Check if image needs optimization
   */
  async needsOptimization(
    buffer: Buffer,
    maxSize: number = 1024 * 1024 // 1MB default
  ): Promise<boolean> {
    if (buffer.length > maxSize) return true

    const metadata = await sharp(buffer).metadata()

    // Check if dimensions are too large
    if (metadata.width && metadata.width > 2048) return true
    if (metadata.height && metadata.height > 2048) return true

    // Check if format can be improved (convert string to avoid type errors)
    const format = String(metadata.format)
    if (format === 'bmp' || format === 'tiff') return true

    return false
  }
}
