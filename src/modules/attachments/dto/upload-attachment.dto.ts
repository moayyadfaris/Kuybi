import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
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
  @ToBoolean()
  @IsBoolean()
  generateThumbnails: boolean = true

  @ApiPropertyOptional({ description: 'Mark attachment as public', default: true })
  @ToBoolean()
  @IsBoolean()
  isPublic: boolean = true

  @ApiPropertyOptional({ description: 'Allow storing duplicate files', default: false })
  @ToBoolean()
  @IsBoolean()
  allowDuplicates: boolean = false

  @ApiPropertyOptional({
    description: 'Process image asynchronously in background queue',
    default: false
  })
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  async?: boolean
}
