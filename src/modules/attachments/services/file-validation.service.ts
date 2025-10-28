import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as mime from 'mime-types'
import * as path from 'path'

export interface MulterFile {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  size: number
  buffer: Buffer
}

export interface FileValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  detectedMimeType?: string
}

export interface FileValidationOptions {
  checkMimeType?: boolean
  checkExtension?: boolean
  checkSize?: boolean
  checkSecurity?: boolean
  maxSize?: number
}

@Injectable()
export class FileValidationService {
  // Allowed MIME types by category
  private readonly allowedMimeTypes = {
    images: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
      'image/tiff'
    ],
    videos: [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/webm',
      'video/x-msvideo',
      'video/x-flv'
    ],
    documents: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/json',
      'application/xml'
    ],
    archives: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip'
    ]
  }

  // Dangerous file extensions that should never be allowed
  private readonly dangerousExtensions = [
    '.exe',
    '.bat',
    '.cmd',
    '.com',
    '.pif',
    '.scr',
    '.vbs',
    '.js',
    '.jar',
    '.msi',
    '.app',
    '.deb',
    '.rpm',
    '.dmg',
    '.pkg',
    '.sh',
    '.run'
  ]

  // Max file sizes by type (in bytes)
  private readonly maxSizes = {
    image: 5 * 1024 * 1024, // 5MB
    video: 100 * 1024 * 1024, // 100MB
    document: 10 * 1024 * 1024, // 10MB
    archive: 50 * 1024 * 1024, // 50MB
    default: 10 * 1024 * 1024 // 10MB
  }

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validate a file comprehensively
   */
  async validateFile(
    file: MulterFile,
    options: FileValidationOptions = {}
  ): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    }

    // Default options
    const opts = {
      checkMimeType: true,
      checkExtension: true,
      checkSize: true,
      checkSecurity: true,
      ...options
    }

    // Check if file exists
    if (!file) {
      result.isValid = false
      result.errors.push('No file provided')
      return result
    }

    // Security checks
    if (opts.checkSecurity) {
      this.performSecurityChecks(file, result)
    }

    // MIME type validation
    if (opts.checkMimeType) {
      this.validateMimeType(file, result)
    }

    // Extension validation
    if (opts.checkExtension) {
      this.validateExtension(file, result)
    }

    // Size validation
    if (opts.checkSize) {
      this.validateFileSize(file, result, opts.maxSize)
    }

    // Check consistency between MIME type and extension
    this.checkMimeTypeExtensionConsistency(file, result)

    return result
  }

  /**
   * Validate MIME type
   */
  private validateMimeType(file: MulterFile, result: FileValidationResult): void {
    const allAllowedTypes = [
      ...this.allowedMimeTypes.images,
      ...this.allowedMimeTypes.videos,
      ...this.allowedMimeTypes.documents,
      ...this.allowedMimeTypes.archives
    ]

    if (!file.mimetype) {
      result.errors.push('File MIME type is missing')
      result.isValid = false
      return
    }

    if (!allAllowedTypes.includes(file.mimetype)) {
      result.errors.push(
        `MIME type '${file.mimetype}' is not allowed. Allowed types: ${allAllowedTypes.join(', ')}`
      )
      result.isValid = false
    }
  }

  /**
   * Validate file extension
   */
  private validateExtension(file: MulterFile, result: FileValidationResult): void {
    const ext = path.extname(file.originalname).toLowerCase()

    if (!ext) {
      result.warnings.push('File has no extension')
    }

    // Check dangerous extensions
    if (this.dangerousExtensions.includes(ext)) {
      result.errors.push(`File extension '${ext}' is not allowed for security reasons`)
      result.isValid = false
    }

    // Check if extension matches allowed MIME types
    const expectedMimeType = mime.lookup(file.originalname)
    if (expectedMimeType) {
      result.detectedMimeType = expectedMimeType
    }
  }

  /**
   * Validate file size
   */
  private validateFileSize(
    file: MulterFile,
    result: FileValidationResult,
    customMaxSize?: number
  ): void {
    if (!file.size || file.size === 0) {
      result.errors.push('File is empty')
      result.isValid = false
      return
    }

    const fileCategory = this.getFileCategory(file.mimetype)
    const maxSize = customMaxSize || this.maxSizes[fileCategory] || this.maxSizes.default

    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2)
      const actualSizeMB = (file.size / (1024 * 1024)).toFixed(2)
      result.errors.push(
        `File size (${actualSizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB) for ${fileCategory} files`
      )
      result.isValid = false
    }
  }

  /**
   * Perform security checks on file
   */
  private performSecurityChecks(file: MulterFile, result: FileValidationResult): void {
    // Check for path traversal attempts in filename
    if (file.originalname.includes('../') || file.originalname.includes('..\\')) {
      result.errors.push('File name contains path traversal characters')
      result.isValid = false
    }

    // Check for null bytes in filename
    if (file.originalname.includes('\0')) {
      result.errors.push('File name contains null bytes')
      result.isValid = false
    }

    // Check filename length
    if (file.originalname.length > 255) {
      result.errors.push('File name is too long (max 255 characters)')
      result.isValid = false
    }

    // Check for suspicious patterns
    if (/[<>:"|?*]/.test(file.originalname)) {
      result.warnings.push('File name contains potentially unsafe characters')
    }
  }

  /**
   * Check consistency between MIME type and extension
   */
  private checkMimeTypeExtensionConsistency(
    file: MulterFile,
    result: FileValidationResult
  ): void {
    if (!result.detectedMimeType) {
      return
    }

    // Allow some flexibility for common cases
    const mimeTypeCategory = this.getFileCategory(file.mimetype)
    const detectedCategory = this.getFileCategory(result.detectedMimeType)

    if (mimeTypeCategory !== detectedCategory) {
      result.warnings.push(
        `Declared MIME type '${file.mimetype}' doesn't match detected type '${result.detectedMimeType}'`
      )
    }
  }

  /**
   * Get file category from MIME type
   */
  private getFileCategory(mimeType: string): 'image' | 'video' | 'document' | 'archive' | 'default' {
    if (this.allowedMimeTypes.images.includes(mimeType)) return 'image'
    if (this.allowedMimeTypes.videos.includes(mimeType)) return 'video'
    if (this.allowedMimeTypes.documents.includes(mimeType)) return 'document'
    if (this.allowedMimeTypes.archives.includes(mimeType)) return 'archive'
    return 'default'
  }

  /**
   * Get maximum allowed size for a MIME type
   */
  getMaxSizeForMimeType(mimeType: string): number {
    const category = this.getFileCategory(mimeType)
    return this.maxSizes[category] || this.maxSizes.default
  }

  /**
   * Check if MIME type is allowed
   */
  isMimeTypeAllowed(mimeType: string): boolean {
    const allAllowedTypes = [
      ...this.allowedMimeTypes.images,
      ...this.allowedMimeTypes.videos,
      ...this.allowedMimeTypes.documents,
      ...this.allowedMimeTypes.archives
    ]
    return allAllowedTypes.includes(mimeType)
  }

  /**
   * Check if file is an image
   */
  isImage(mimeType: string): boolean {
    return this.allowedMimeTypes.images.includes(mimeType)
  }

  /**
   * Check if file is a video
   */
  isVideo(mimeType: string): boolean {
    return this.allowedMimeTypes.videos.includes(mimeType)
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename: string): string {
    // Remove path components
    let sanitized = path.basename(filename)

    // Replace unsafe characters with underscores
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_')

    // Remove multiple consecutive underscores
    sanitized = sanitized.replace(/_{2,}/g, '_')

    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '')

    // Ensure it has a name
    if (!sanitized || sanitized === '.') {
      sanitized = `file_${Date.now()}`
    }

    // Limit length
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized)
      const name = sanitized.substring(0, 255 - ext.length)
      sanitized = name + ext
    }

    return sanitized.toLowerCase()
  }

  /**
   * Get all allowed MIME types
   */
  getAllAllowedMimeTypes(): string[] {
    return [
      ...this.allowedMimeTypes.images,
      ...this.allowedMimeTypes.videos,
      ...this.allowedMimeTypes.documents,
      ...this.allowedMimeTypes.archives
    ]
  }
}
