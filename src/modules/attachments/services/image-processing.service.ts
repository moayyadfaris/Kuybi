import { Injectable, InternalServerErrorException } from '@nestjs/common'
import sharp, { type FitEnum } from 'sharp'

import { IMAGE_OPERATION_TIMEOUT } from '../utils/attachment-image.util'

export interface ThumbnailSize {
  name: string
  width: number
  height?: number
  fit?: keyof FitEnum
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

/** Thumbnails of a stored image: small and medium squares, large and preview fitted */
@Injectable()
export class ImageProcessingService {
  // Predefined thumbnail sizes
  private readonly defaultThumbnailSizes: ThumbnailSize[] = [
    { name: 'small', width: 150, height: 150, fit: 'cover' },
    { name: 'medium', width: 300, height: 300, fit: 'cover' },
    { name: 'large', width: 600, height: 600, fit: 'inside' },
    { name: 'preview', width: 1200, fit: 'inside' }
  ]

  /**
   * Resize image to specific dimensions
   */
  async resize(
    buffer: Buffer,
    width: number,
    height?: number,
    options: {
      fit?: keyof FitEnum
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

      let resized = sharp(buffer).timeout(IMAGE_OPERATION_TIMEOUT).resize({
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
    } catch {
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
    } catch {
      throw new InternalServerErrorException('Failed to generate thumbnails')
    }
  }
}
