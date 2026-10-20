import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator'

import { ContentStatus } from '../../enums/content-status.enum'

/**
 * A new entry. field_data is validated against the post type's field definitions.
 * (Parent, metadata and attachment/tag/category links are not implemented.)
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
    description: 'Content status (published and scheduled need Publish; deleted is not settable)',
    enum: ContentStatus,
    example: ContentStatus.DRAFT,
    default: ContentStatus.DRAFT
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus

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
  field_data: Record<string, unknown>

  @ApiPropertyOptional({
    description: 'Scheduled publication date',
    example: '2025-12-01T09:00:00.000Z'
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string
}
