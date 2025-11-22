import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

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
  @IsString({ each: true })
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
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value
    return value === 'true' || value === '1'
  })
  @IsBoolean()
  isPublic?: boolean

  @ApiPropertyOptional({
    description: 'Additional metadata as JSON object',
    example: { projectId: '123', documentType: 'invoice' }
  })
  @IsOptional()
  metadata?: Record<string, unknown>
}
