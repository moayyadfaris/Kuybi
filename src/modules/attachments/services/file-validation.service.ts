import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isUtf8 } from 'buffer'
import { fileTypeFromBuffer } from 'file-type'
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
  /** Type detected from the file's content (magic number) */
  detectedMimeType?: string
  /** Content-verified type that is safe to store and serve the file with */
  verifiedMimeType?: string
}

export interface FileValidationOptions {
  checkMimeType?: boolean
  checkExtension?: boolean
  checkSize?: boolean
  checkSecurity?: boolean
  maxSize?: number
  /**
   * `file.buffer` holds only the start of the file (direct uploads read a head from
   * storage); `file.size` is the full size
   */
  truncatedContent?: boolean
}

/**
 * Hard ceiling for a single uploaded file, enforced by multer while streaming (before the
 * file is buffered in memory). Must be >= the largest per-category limit below (video).
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

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
      'application/json'
    ],
    archives: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip'
    ]
  }

  // SVG and XML are deliberately not allowed: both can carry script that runs when the
  // file is opened in a browser (stored XSS from a public bucket or CDN).

  // Formats without a magic number; verified as UTF-8 text instead
  private readonly textMimeTypes = ['text/plain', 'text/csv', 'application/json']

  // Legacy Office formats are OLE compound files; content detection reports the container
  private readonly legacyOfficeMimeTypes = [
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ]

  // Office Open XML formats are ZIP containers; detection may report plain ZIP
  private readonly openXmlMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]

  // Declared aliases -> the name content detection uses
  private readonly mimeAliases: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'video/x-msvideo': 'video/vnd.avi'
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
    video: MAX_UPLOAD_BYTES, // 100MB
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

    // MIME type validation: declared type must be allowed and match the actual content
    if (opts.checkMimeType) {
      this.validateMimeType(file, result)
      if (result.isValid) {
        await this.verifyContentMatchesDeclaredType(file, result, opts.truncatedContent)
      }
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
   * Checks what a client declares before uploading directly to storage: allowed type,
   * safe name and extension, size. The content itself is verified on completion with
   * validateFile(..., { truncatedContent: true }).
   */
  validateDeclaredFile(
    declared: Pick<MulterFile, 'originalname' | 'mimetype' | 'size'>
  ): FileValidationResult {
    const file = { ...declared, buffer: Buffer.alloc(0) } as MulterFile
    const result: FileValidationResult = { isValid: true, errors: [], warnings: [] }
    this.performSecurityChecks(file, result)
    this.validateMimeType(file, result)
    this.validateExtension(file, result)
    this.validateFileSize(file, result)
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
  }

  /**
   * Compare the declared MIME type with the file's actual content.
   * The declared type comes from the client and must never be trusted on its own.
   */
  private async verifyContentMatchesDeclaredType(
    file: MulterFile,
    result: FileValidationResult,
    truncated = false
  ): Promise<void> {
    const declared = this.mimeAliases[file.mimetype] ?? file.mimetype
    const detected = file.buffer?.length ? await fileTypeFromBuffer(file.buffer) : undefined
    result.detectedMimeType = detected?.mime

    const reject = (message: string) => {
      result.errors.push(message)
      result.isValid = false
    }

    if (this.textMimeTypes.includes(declared)) {
      if (detected) {
        return reject(`File declared as '${file.mimetype}' but its content is '${detected.mime}'`)
      }
      const text = truncated ? withoutPartialUtf8Tail(file.buffer) : file.buffer
      if (!isUtf8(text) || text.includes(0)) {
        return reject(`File declared as '${file.mimetype}' but its content is not plain text`)
      }
      result.verifiedMimeType = declared
      return
    }

    if (!detected) {
      return reject('Unable to determine the file type from its content')
    }

    const matches =
      detected.mime === declared ||
      (detected.mime === 'application/x-cfb' && this.legacyOfficeMimeTypes.includes(declared)) ||
      (detected.mime === 'application/zip' && this.openXmlMimeTypes.includes(declared))

    if (!matches) {
      return reject(`File declared as '${file.mimetype}' but its content is '${detected.mime}'`)
    }

    // Office containers keep the more specific declared type; everything else uses
    // the detected one
    result.verifiedMimeType = detected.mime === declared ? detected.mime : declared
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
  private checkMimeTypeExtensionConsistency(file: MulterFile, result: FileValidationResult): void {
    const extensionMimeType = mime.lookup(file.originalname)
    if (!extensionMimeType) {
      return
    }

    // The extension is informational only; content verification is what matters
    if (this.getFileCategory(file.mimetype) !== this.getFileCategory(extensionMimeType)) {
      result.warnings.push(
        `Declared MIME type '${file.mimetype}' doesn't match the file extension ('${extensionMimeType}')`
      )
    }
  }

  /**
   * Get file category from MIME type
   */
  private getFileCategory(
    mimeType: string
  ): 'image' | 'video' | 'document' | 'archive' | 'default' {
    if (this.allowedMimeTypes.images.includes(mimeType)) return 'image'
    if (this.allowedMimeTypes.videos.includes(mimeType)) return 'video'
    if (this.allowedMimeTypes.documents.includes(mimeType)) return 'document'
    if (this.allowedMimeTypes.archives.includes(mimeType)) return 'archive'
    return 'default'
  }

  /**
   * Check if file is an image
   */
  isImage(mimeType: string): boolean {
    return this.allowedMimeTypes.images.includes(mimeType)
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
}

/**
 * Drops an incomplete UTF-8 sequence at the end of a buffer that was cut at an
 * arbitrary byte (a head read), so valid text is not rejected for the cut itself.
 */
export function withoutPartialUtf8Tail(buffer: Buffer): Buffer {
  for (let back = 1; back <= Math.min(3, buffer.length); back++) {
    const byte = buffer[buffer.length - back]
    if ((byte & 0xc0) !== 0x80) {
      // Lead byte (or ASCII): how long should its sequence be?
      const expected = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
      return expected > back ? buffer.subarray(0, buffer.length - back) : buffer
    }
  }
  return buffer
}
