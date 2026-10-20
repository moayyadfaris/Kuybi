import { BadRequestException, Injectable } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import sharp from 'sharp'

import { hasGpsData } from '../utils/exif-gps.util'

/** What is read from an image's metadata: dimensions and whether it records a location */
export interface ExifData {
  /** Present (empty) when the image has GPS data; coordinates are never read */
  location?: Record<string, never>
  dimensions?: {
    width: number
    height: number
    orientation?: number
  }
  colorSpace?: string
  hasTransparency?: boolean
}

export interface ExifProcessingOptions {
  stripSensitiveData?: boolean
  /** Keep the ICC colour profile (no personal data; dropping it can shift colours). Default true */
  preserveColorProfile?: boolean
  autoRotate?: boolean
}

export interface ExifProcessingResult {
  buffer: Buffer
  exifData: ExifData
  stripped: string[]
  orientation: number
}

/**
 * Image metadata: strips EXIF/XMP/IPTC (GPS, camera serials, timestamps) while applying
 * the orientation, and keeps a safe summary (dimensions, format, whether a location was
 * recorded)
 */
@Injectable()
export class ExifProcessorService {
  constructor(
    @InjectPinoLogger(ExifProcessorService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Extract EXIF data from image buffer
   */
  async extractExifData(buffer: Buffer): Promise<ExifData> {
    try {
      const metadata = await sharp(buffer).metadata()

      const exifData: ExifData = {
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0,
          orientation: metadata.orientation
        },
        colorSpace: metadata.space,
        hasTransparency: metadata.hasAlpha || false
      }

      // Only the presence of GPS is detected (coordinates are never read or stored)
      if (hasGpsData(metadata.exif)) {
        exifData.location = {}
      }

      this.logger.debug({ dimensions: exifData.dimensions }, 'Extracted EXIF data')
      return exifData
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to extract EXIF data')
      throw new BadRequestException('Failed to process image metadata')
    }
  }

  /**
   * Strip sensitive EXIF data from image
   */
  async stripSensitiveData(
    buffer: Buffer,
    options: ExifProcessingOptions = {}
  ): Promise<ExifProcessingResult> {
    try {
      const exifData = await this.extractExifData(buffer)
      const input = await sharp(buffer).metadata()

      let image = sharp(buffer)
      if (options.autoRotate !== false) {
        // Applies the EXIF orientation to the pixels, so the tag is no longer needed
        image = image.rotate()
      }
      if (options.stripSensitiveData === false) {
        image = image.keepMetadata()
      } else if (options.preserveColorProfile !== false) {
        image = image.keepIccProfile()
      }
      // sharp writes no EXIF/XMP/IPTC unless asked to. withMetadata() would KEEP them
      // (GPS coordinates, camera serials, timestamps): never use it here.
      const processedBuffer = await image.toBuffer()

      const stripped: string[] = []
      if (options.stripSensitiveData !== false) {
        if (input.exif) stripped.push('exif')
        if (hasGpsData(input.exif)) stripped.push('gps')
        if (input.xmp) stripped.push('xmp')
        if (input.iptc) stripped.push('iptc')
      }
      if (options.autoRotate !== false && (input.orientation ?? 1) !== 1) {
        stripped.push('orientation')
      }

      this.logger.info({ stripped }, 'Stripped sensitive image metadata')

      return {
        buffer: processedBuffer,
        exifData,
        stripped,
        orientation: exifData.dimensions?.orientation || 1
      }
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to strip EXIF data')
      throw new BadRequestException('Failed to process image metadata')
    }
  }

  /**
   * Generate metadata summary for storage
   */
  async generateMetadataSummary(buffer: Buffer): Promise<Record<string, unknown>> {
    try {
      const exifData = await this.extractExifData(buffer)
      const metadata = await sharp(buffer).metadata()

      return {
        // Dimensions
        width: exifData.dimensions?.width,
        height: exifData.dimensions?.height,
        orientation: exifData.dimensions?.orientation,

        // Format details
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        hasProfile: !!metadata.icc,

        size: metadata.size,

        // Location flag (coordinates are never read or stored)
        hasLocation: exifData.location !== undefined
      }
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to generate metadata summary')
      return {}
    }
  }

  /**
   * Validate image metadata for security concerns
   */
  async validateMetadata(buffer: Buffer): Promise<{ valid: boolean; issues: string[] }> {
    try {
      const metadata = await sharp(buffer).metadata()
      const issues: string[] = []

      // Check for suspicious dimensions
      if (metadata.width && metadata.width > 50000) {
        issues.push('Suspicious width: exceeds reasonable limits')
      }
      if (metadata.height && metadata.height > 50000) {
        issues.push('Suspicious height: exceeds reasonable limits')
      }

      // Check for unusual formats
      const unsafeFormats = ['svg', 'pdf']
      if (metadata.format && unsafeFormats.includes(metadata.format)) {
        issues.push(`Potentially unsafe format: ${metadata.format}`)
      }

      // Check for excessive metadata size
      const metadataSize = (metadata.exif?.length || 0) + (metadata.iptc?.length || 0)
      if (metadataSize > 100000) {
        // 100KB
        issues.push('Excessive metadata size - possible data hiding')
      }

      return {
        valid: issues.length === 0,
        issues
      }
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Failed to validate metadata')
      return {
        valid: false,
        issues: ['Failed to read image metadata']
      }
    }
  }
}
