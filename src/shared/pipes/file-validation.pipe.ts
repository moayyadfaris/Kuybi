import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { fileTypeFromBuffer } from 'file-type'

export interface FileValidationOptions {
  maxSize?: number // bytes
  allowedMimeTypes?: string[]
  allowedExtensions?: string[]
  requireMagicNumberMatch?: boolean
}

/**
 * File validation pipe using magic numbers (file signatures) for MIME type verification
 * Prevents MIME type spoofing by checking actual file content
 */
@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly defaultOptions: Required<FileValidationOptions> = {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'],
    requireMagicNumberMatch: true
  }

  constructor(private readonly options: FileValidationOptions = {}) {}

  async transform(file: Express.Multer.File): Promise<Express.Multer.File> {
    const opts = { ...this.defaultOptions, ...this.options }

    // Validate file exists
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }

    // Validate size
    if (file.size > opts.maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${this.formatBytes(opts.maxSize)}, got ${this.formatBytes(file.size)}`
      )
    }

    // Validate filename
    this.validateFilename(file.originalname)

    // Validate extension
    if (opts.allowedExtensions.length > 0) {
      const ext = this.getFileExtension(file.originalname)
      if (!opts.allowedExtensions.includes(ext)) {
        throw new BadRequestException(
          `File type not allowed. Allowed extensions: ${opts.allowedExtensions.join(', ')}`
        )
      }
    }

    // Validate MIME type via magic numbers
    if (opts.requireMagicNumberMatch) {
      await this.validateMimeType(file, opts.allowedMimeTypes)
    }

    return file
  }

  /**
   * Validate MIME type using file's magic number (file signature)
   * Prevents spoofing by checking actual file content, not just extension
   */
  private async validateMimeType(
    file: Express.Multer.File,
    allowedMimeTypes: string[]
  ): Promise<void> {
    try {
      const fileType = await fileTypeFromBuffer(file.buffer)

      if (!fileType) {
        throw new BadRequestException(
          'Unable to determine file type. File may be corrupted or empty.'
        )
      }

      if (!allowedMimeTypes.includes(fileType.mime)) {
        throw new BadRequestException(
          `File type not allowed. Detected: ${fileType.mime}. Allowed: ${allowedMimeTypes.join(', ')}`
        )
      }

      // Update file MIME type with detected value (prevents spoofing)
      file.mimetype = fileType.mime
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new BadRequestException('File validation failed')
    }
  }

  /**
   * Validate filename for security issues
   */
  private validateFilename(filename: string): void {
    // Check for null bytes
    if (filename.includes('\0')) {
      throw new BadRequestException('Invalid filename: contains null bytes')
    }

    // Check for directory traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename: directory traversal not allowed')
    }

    // Check filename length
    if (filename.length > 255) {
      throw new BadRequestException('Filename too long (max 255 characters)')
    }

    // Check for empty filename
    if (!filename || filename.trim().length === 0) {
      throw new BadRequestException('Filename cannot be empty')
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/g
    if (dangerousChars.test(filename)) {
      throw new BadRequestException('Invalid filename: contains dangerous characters')
    }
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    if (lastDot === -1) return ''
    return filename.substring(lastDot).toLowerCase()
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }
}

/**
 * Image-specific validation pipe
 */
@Injectable()
export class ImageValidationPipe extends FileValidationPipe {
  constructor(
    maxSize: number = 5 * 1024 * 1024, // 5MB default for images
    maxWidth?: number,
    maxHeight?: number
  ) {
    super({
      maxSize,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      requireMagicNumberMatch: true
    })

    this.maxWidth = maxWidth
    this.maxHeight = maxHeight
  }

  private maxWidth?: number
  private maxHeight?: number

  async transform(file: Express.Multer.File): Promise<Express.Multer.File> {
    const validatedFile = await super.transform(file)

    // Additional image dimension validation could be added here
    // Requires image processing library like sharp
    if (this.maxWidth || this.maxHeight) {
      await this.validateDimensions(validatedFile)
    }

    return validatedFile
  }

  private async validateDimensions(file: Express.Multer.File): Promise<void> {
    // Placeholder for dimension validation
    // Would require sharp or similar library:
    // const metadata = await sharp(file.buffer).metadata()
    // if (this.maxWidth && metadata.width > this.maxWidth) { throw... }
    // if (this.maxHeight && metadata.height > this.maxHeight) { throw... }

    // For now, just log that dimensions would be checked
    if (file.mimetype.startsWith('image/')) {
      // Dimensions check placeholder
    }
  }
}

/**
 * Document-specific validation pipe
 */
@Injectable()
export class DocumentValidationPipe extends FileValidationPipe {
  constructor(maxSize: number = 20 * 1024 * 1024) {
    // 20MB default for documents
    super({
      maxSize,
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
      ],
      allowedExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
      requireMagicNumberMatch: true
    })
  }
}
