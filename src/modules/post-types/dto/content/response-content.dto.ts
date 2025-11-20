import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform, Type } from 'class-transformer'
import { ContentStatus } from '../../enums/content-status.enum'

/**
 * Simple user DTO for author information
 */
class AuthorDto {
  @Expose()
  id: string

  @Expose()
  name: string

  @Expose()
  email: string
}

/**
 * DTO for content responses
 */
export class ResponseContentDto {
  @ApiProperty({ description: 'Content ID' })
  @Expose()
  id: string

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
  scheduledFor?: Date

  @ApiProperty({ description: 'Custom field data' })
  @Expose()
  @Transform(({ obj }) => obj.fieldData || {})
  field_data: Record<string, any>

  @ApiPropertyOptional({ description: 'Metadata' })
  @Expose()
  metadata?: Record<string, any>

  @ApiProperty({ description: 'View count', default: 0 })
  @Expose()
  viewCount: number

  @ApiProperty({ description: 'Like count', default: 0 })
  @Expose()
  likeCount: number

  @ApiProperty({ description: 'Comment count', default: 0 })
  @Expose()
  commentCount: number

  @ApiProperty({ description: 'Share count', default: 0 })
  @Expose()
  shareCount: number

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

  @ApiPropertyOptional({ description: 'Attachments' })
  @Expose()
  attachments?: any[]

  @ApiPropertyOptional({ description: 'Tags' })
  @Expose()
  tags?: any[]

  @ApiPropertyOptional({ description: 'Categories' })
  @Expose()
  categories?: any[]
}
