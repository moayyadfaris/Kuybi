import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class UploadAttachmentDto {
  @ApiPropertyOptional({ description: 'Attachment category', example: 'image' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string

  @ApiPropertyOptional({ description: 'Attachment description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({
    description: 'Comma separated or array of tag strings',
    type: [String]
  })
  @Transform(({ value }) => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value
        .map(tag => (typeof tag === 'string' ? tag.trim() : tag))
        .filter(tag => typeof tag === 'string' && tag.length > 0)
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
    }
    return []
  })
  @IsArray()
  @IsString({ each: true })
  tags: string[] = []

  @ApiPropertyOptional({ description: 'Generate thumbnails for images/videos', default: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return true
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['false', '0', 'no'].includes(normalized)) return false
    return true
  })
  @IsBoolean()
  generateThumbnails: boolean = true

  @ApiPropertyOptional({ description: 'Mark attachment as public', default: false })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    return false
  })
  @IsBoolean()
  isPublic: boolean = false

  @ApiPropertyOptional({ description: 'Allow storing duplicate files', default: false })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    return false
  })
  @IsBoolean()
  allowDuplicates: boolean = false

  @ApiPropertyOptional({
    description: 'Process image asynchronously in background queue',
    default: false
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    if (['true', '1', 'yes'].includes(normalized)) return true
    return false
  })
  @IsBoolean()
  @IsOptional()
  async?: boolean
}
