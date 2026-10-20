import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * What the owner may change. Not metadata: it holds the storage keys of the derived
 * objects, which visibility changes and deletes act on.
 */
export class UpdateAttachmentDto {
  @ApiPropertyOptional({ description: 'Attachment category', example: 'documents' })
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
    description: 'Array of tag strings',
    type: [String],
    example: ['invoice', '2024']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[]

  @ApiPropertyOptional({
    description: 'Folder/directory for organization',
    example: 'invoices/2024'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  folder?: string

  @ApiPropertyOptional({ description: 'Mark attachment as public', default: false })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isPublic?: boolean
}
