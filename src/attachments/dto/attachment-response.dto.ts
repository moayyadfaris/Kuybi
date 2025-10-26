import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AttachmentResponseDto {
  @ApiProperty({ description: 'Attachment ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string

  @ApiProperty({ description: 'User ID who uploaded the file' })
  userId: string

  @ApiProperty({ description: 'Original filename', example: 'document.pdf' })
  originalName: string

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  mimeType: string

  @ApiProperty({ description: 'File size in bytes', example: 1048576 })
  size: number

  @ApiPropertyOptional({ description: 'File category', example: 'documents' })
  category?: string

  @ApiPropertyOptional({ description: 'File description' })
  description?: string

  @ApiPropertyOptional({ description: 'Tags associated with the file', type: [String] })
  tags?: string[]

  @ApiProperty({ description: 'Is file publicly accessible', example: false })
  isPublic: boolean

  @ApiProperty({ description: 'Is file encrypted', example: false })
  isEncrypted: boolean

  @ApiProperty({ description: 'Security scan status', example: 'approved' })
  securityStatus: string

  @ApiPropertyOptional({ description: 'SHA-256 checksum of the file' })
  checksum?: string

  @ApiProperty({ description: 'Number of times downloaded', example: 5 })
  downloadCount: number

  @ApiPropertyOptional({ description: 'Last accessed timestamp' })
  lastAccessedAt?: Date

  @ApiPropertyOptional({ description: 'Folder/directory path', example: 'invoices/2024' })
  folder?: string

  @ApiPropertyOptional({ description: 'File expiration date' })
  expiresAt?: Date

  @ApiPropertyOptional({ description: 'Thumbnail path if available' })
  thumbnailPath?: string

  @ApiPropertyOptional({ 
    description: 'Additional metadata', 
    type: 'object',
    additionalProperties: true 
  })
  metadata?: Record<string, unknown>

  @ApiProperty({ description: 'File version number', example: 1 })
  version: number

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date

  @ApiPropertyOptional({ description: 'Soft delete timestamp' })
  deletedAt?: Date

  @ApiPropertyOptional({ description: 'Public URL (if isPublic=true)' })
  url?: string

  @ApiPropertyOptional({ description: 'Download URL (authenticated or presigned)' })
  downloadUrl?: string

  @ApiPropertyOptional({ description: 'Preview/thumbnail URL' })
  previewUrl?: string
}
