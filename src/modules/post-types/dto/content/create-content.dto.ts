import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator'

import { ContentStatus } from '../../enums/content-status.enum'

/**
 * DTO for creating new content
 */
export class CreateContentDto {
  @ApiProperty({
    description: 'Content title',
    example: 'Tech Conference 2025'
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({
    description: 'Short excerpt',
    example: 'Annual technology conference'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  excerpt?: string

  @ApiPropertyOptional({
    description: 'Content status',
    enum: ContentStatus,
    example: ContentStatus.DRAFT,
    default: ContentStatus.DRAFT
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus

  @ApiPropertyOptional({
    description: 'Parent content ID (for hierarchical types)',
    example: 'uuid'
  })
  @IsOptional()
  @IsUUID()
  parentId?: string

  @ApiProperty({
    description: 'Custom field values',
    example: {
      event_date: '2025-12-15',
      location: 'New York',
      price: '299.00',
      max_attendees: '500'
    }
  })
  @IsObject()
  field_data: Record<string, any>

  @ApiPropertyOptional({
    description: 'Metadata (SEO, etc.)',
    example: { seoTitle: 'Custom title', seoDescription: 'Custom description' }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>

  @ApiPropertyOptional({
    description: 'Attachment IDs',
    example: ['uuid1', 'uuid2']
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  attachmentIds?: string[]

  @ApiPropertyOptional({
    description: 'Tag IDs',
    example: ['uuid1', 'uuid2']
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  tagIds?: string[]

  @ApiPropertyOptional({
    description: 'Category IDs',
    example: ['uuid1']
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  categoryIds?: string[]

  @ApiPropertyOptional({
    description: 'Scheduled publication date',
    example: '2025-12-01T09:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string
}
