import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as sharp from 'sharp'

export interface ThumbnailSize {
  name: string
  width: number
  height?: number
  fit?: keyof sharp.FitEnum
  format?: 'jpeg' | 'png' | 'webp'
}

export interface ImageProcessingResult {
  buffer: Buffer
  metadata: {
    width: number
    height: number
    format: string
    size: number
    hasAlpha: boolean
  }
}

export interface ThumbnailResult {
  [key: string]: {
    buffer: Buffer
    width: number
    height: number
    size: number
    format: string
  }
}

@Injectable()
export class ImageProcessingService {
  // Predefined thumbnail sizes
  private readonly defaultThumbnailSizes: ThumbnailSize[] = [
    { name: 'small', width: 150, height: 150, fit: 'cover' },
    { name: 'medium', width: 300, height: 300, fit: 'cover' },
    { name: 'large', width: 600, height: 600, fit: 'inside' },
    { name: 'preview', width: 1200, fit: 'inside' }
  ]

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get image metadata
   */
  async getMetadata(buffer: Buffer): Promise<sharp.Metadata> {
    try {
      return await sharp(buffer).metadata()
    } catch (error) {
      throw new BadRequestException('Invalid image file or corrupted data')
    }
  }

  /**
   * Resize image to specific dimensions
   */
  async resize(
    buffer: Buffer,
    width: number,
    height?: number,
    options: {
      fit?: keyof sharp.FitEnum
      withoutEnlargement?: boolean
      quality?: number
      format?: 'jpeg' | 'png' | 'webp'
      background?:
        | string
        | {
            r: number
            g: number
            b: number
            alpha?: number
          }
    } = {}
  ): Promise<ImageProcessingResult> {
    try {
      const {
        fit = 'inside',
        withoutEnlargement = true,
        quality = 90,
        format = 'jpeg',
        background
      } = options

      let resized = sharp(buffer).resize({
        width,
        height,
        fit,
        withoutEnlargement,
        background
      })

      switch (format) {
        case 'png':
          resized = resized.png({ quality, compressionLevel: 9 })
          break
        case 'webp':
          resized = resized.webp({ quality })
          break
        case 'jpeg':
        default:
          resized = resized.jpeg({ quality, progressive: true })
          break
      }

      const resultBuffer = await resized.toBuffer({ resolveWithObject: true })

      return {
        buffer: resultBuffer.data,
        metadata: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
          format: resultBuffer.info.format,
          size: resultBuffer.data.length,
          hasAlpha: resultBuffer.info.channels === 4
        }
      }
    } catch (error) {
      throw new InternalServerErrorException('Failed to resize image')
    }
  }

  /**
   * Generate thumbnails in multiple sizes
   */
  async generateThumbnails(buffer: Buffer, sizes?: ThumbnailSize[]): Promise<ThumbnailResult> {
    const thumbnailSizes = sizes || this.defaultThumbnailSizes
    const results: ThumbnailResult = {}

    try {
      await Promise.all(
        thumbnailSizes.map(async size => {
          const resized = await this.resize(buffer, size.width, size.height, {
            fit: size.fit || 'cover',
            quality: 85,
            format: size.format || 'jpeg',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })

          results[size.name] = {
            buffer: resized.buffer,
            width: resized.metadata.width,
            height: resized.metadata.height,
            size: resized.metadata.size,
            format: resized.metadata.format
          }
        })
      )

      return results
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate thumbnails')
    }
  }

  /**
   * Convert image to different format
   */
  async convertFormat(
    buffer: Buffer,
    format: 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff',
    quality = 90
  ): Promise<Buffer> {
    try {
      let image = sharp(buffer)

      switch (format) {
        case 'jpeg':
          image = image.jpeg({ quality, progressive: true })
          break
        case 'png':
          image = image.png({ quality, compressionLevel: 9 })
          break
        case 'webp':
          image = image.webp({ quality })
          break
        case 'avif':
          image = image.avif({ quality })
          break
        case 'tiff':
          image = image.tiff({ quality })
          break
      }

      return await image.toBuffer()
    } catch (error) {
      throw new InternalServerErrorException(`Failed to convert image to ${format}`)
    }
  }

  /**
   * Optimize image (reduce file size while maintaining quality)
   */
  async optimize(
    buffer: Buffer,
    options: {
      maxWidth?: number
      maxHeight?: number
      quality?: number
      convertToWebP?: boolean
    } = {}
  ): Promise<ImageProcessingResult> {
    try {
      const { maxWidth = 2000, maxHeight = 2000, quality = 85, convertToWebP = false } = options

      let image = sharp(buffer)

      // Get original metadata
      const metadata = await image.metadata()

      // Resize if needed
      if (
        (metadata.width && metadata.width > maxWidth) ||
        (metadata.height && metadata.height > maxHeight)
      ) {
        image = image.resize({
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        })
      }

      // Apply format-specific optimization
      if (convertToWebP) {
        image = image.webp({ quality, effort: 6 })
      } else if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        image = image.jpeg({ quality, progressive: true, mozjpeg: true })
      } else if (metadata.format === 'png') {
        image = image.png({ quality, compressionLevel: 9, adaptiveFiltering: true })
      }

      const result = await image.toBuffer({ resolveWithObject: true })

      return {
        buffer: result.data,
        metadata: {
          width: result.info.width,
          height: result.info.height,
          format: result.info.format,
          size: result.data.length,
          hasAlpha: result.info.channels === 4
        }
      }
    } catch (error) {
      throw new InternalServerErrorException('Failed to optimize image')
    }
  }

  /**
   * Extract dominant colors from image
   */
  async extractDominantColors(buffer: Buffer, _numColors = 5): Promise<string[]> {
    try {
      await sharp(buffer).resize(100, 100, { fit: 'cover' }).stats()

      // Return a placeholder color - in production use a proper color quantization library
      return ['#808080']
    } catch (error) {
      throw new InternalServerErrorException('Failed to extract dominant colors')
    }
  }

  /**
   * Crop image
   */
  async crop(buffer: Buffer, x: number, y: number, width: number, height: number): Promise<Buffer> {
    try {
      return await sharp(buffer).extract({ left: x, top: y, width, height }).toBuffer()
    } catch (error) {
      throw new InternalServerErrorException('Failed to crop image')
    }
  }

  /**
   * Rotate image
   */
  async rotate(buffer: Buffer, angle: number): Promise<Buffer> {
    try {
      return await sharp(buffer).rotate(angle).toBuffer()
    } catch (error) {
      throw new InternalServerErrorException('Failed to rotate image')
    }
  }

  /**
   * Apply blur effect
   */
  async blur(buffer: Buffer, sigma = 5): Promise<Buffer> {
    try {
      return await sharp(buffer).blur(sigma).toBuffer()
    } catch (error) {
      throw new InternalServerErrorException('Failed to apply blur effect')
    }
  }

  /**
   * Convert to grayscale
   */
  async grayscale(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).grayscale().toBuffer()
    } catch (error) {
      throw new InternalServerErrorException('Failed to convert to grayscale')
    }
  }

  /**
   * Add watermark to image
   */
  async addWatermark(
    buffer: Buffer,
    watermarkBuffer: Buffer,
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' = 'bottom-right',
    opacity = 0.5
  ): Promise<Buffer> {
    try {
      const image = sharp(buffer)
      const metadata = await image.metadata()

      // Resize watermark to 20% of image width
      const watermarkWidth = Math.floor((metadata.width || 1000) * 0.2)
      const resizedWatermark = await sharp(watermarkBuffer)
        .resize({ width: watermarkWidth })
        .toBuffer()

      const watermarkMetadata = await sharp(resizedWatermark).metadata()

      // Calculate position
      let left = 0
      let top = 0

      switch (position) {
        case 'top-left':
          left = 10
          top = 10
          break
        case 'top-right':
          left = (metadata.width || 0) - (watermarkMetadata.width || 0) - 10
          top = 10
          break
        case 'bottom-left':
          left = 10
          top = (metadata.height || 0) - (watermarkMetadata.height || 0) - 10
          break
        case 'bottom-right':
          left = (metadata.width || 0) - (watermarkMetadata.width || 0) - 10
          top = (metadata.height || 0) - (watermarkMetadata.height || 0) - 10
          break
        case 'center':
          left = Math.floor(((metadata.width || 0) - (watermarkMetadata.width || 0)) / 2)
          top = Math.floor(((metadata.height || 0) - (watermarkMetadata.height || 0)) / 2)
          break
      }

      return await image
        .composite([
          {
            input: await sharp(resizedWatermark).ensureAlpha(opacity).toBuffer(),
            left,
            top
          }
        ])
        .toBuffer()
    } catch (error) {
      throw new InternalServerErrorException('Failed to add watermark')
    }
  }

  /**
   * Check if buffer is a valid image
   */
  async isValidImage(buffer: Buffer): Promise<boolean> {
    try {
      await sharp(buffer).metadata()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get image dimensions
   */
  async getDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata()
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      }
    } catch (error) {
      throw new BadRequestException('Failed to get image dimensions')
    }
  }
}
