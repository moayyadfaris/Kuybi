import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform, Type } from 'class-transformer'

import { ContentStatus } from '../../enums/content-status.enum'

/** The author as shown with an entry (public): no contact details */
class AuthorDto {
  @Expose()
  id: string

  @Expose()
  name: string
}

/**
 * DTO for content responses
 */
export class ResponseContentDto {
  @ApiProperty({ description: 'Content ID' })
  @Expose()
  id: string

  @ApiProperty({ description: 'Send back with an update (optimistic locking)', example: 1 })
  @Expose()
  version: number

  @ApiProperty({ description: 'Post type ID' })
  @Expose()
  postTypeId: string

  @ApiProperty({ description: 'Author ID' })
  @Expose()
  authorId: string

  @ApiPropertyOptional({ description: 'Parent ID (for hierarchical)' })
  @Expose()
  parentId?: string

  @ApiProperty({ description: 'Content title' })
  @Expose()
  title: string

  @ApiProperty({ description: 'URL-friendly slug' })
  @Expose()
  slug: string

  @ApiPropertyOptional({ description: 'Excerpt' })
  @Expose()
  excerpt?: string

  @ApiProperty({ description: 'Content status', enum: ContentStatus })
  @Expose()
  status: ContentStatus

  @ApiPropertyOptional({ description: 'Published at timestamp' })
  @Expose()
  publishedAt?: Date

  @ApiPropertyOptional({ description: 'Scheduled for timestamp' })
  @Expose()
  // Entity stores this as scheduledAt; the API uses scheduledFor in requests and responses
  @Transform(({ obj }) => obj.scheduledAt ?? null)
  scheduledFor?: Date

  @ApiProperty({ description: 'Custom field data' })
  @Expose()
  @Transform(({ obj }) => obj.fieldData || {})
  field_data: Record<string, unknown>

  @ApiPropertyOptional({ description: 'Metadata' })
  @Expose()
  metadata?: Record<string, unknown>

  @ApiProperty({ description: 'View count', default: 0 })
  @Expose()
  viewCount: number

  @ApiProperty({ description: 'Like count', default: 0 })
  @Expose()
  likeCount: number

  @ApiProperty({ description: 'Comment count', default: 0 })
  @Expose()
  commentCount: number

  @ApiPropertyOptional({ description: 'Hierarchy path' })
  @Expose()
  hierarchyPath?: string

  @ApiProperty({ description: 'Created at timestamp' })
  @Expose()
  createdAt: Date

  @ApiProperty({ description: 'Updated at timestamp' })
  @Expose()
  updatedAt: Date

  @ApiPropertyOptional({ description: 'Author information', type: AuthorDto })
  @Expose()
  @Type(() => AuthorDto)
  author?: AuthorDto
}
