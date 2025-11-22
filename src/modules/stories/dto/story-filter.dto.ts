import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from 'class-validator'

import { StoryPriority, StoryStatus, StoryType } from '../entities/story.entity'

export enum StorySortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class StoryFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by story status',
    enum: StoryStatus,
    example: StoryStatus.PUBLISHED
  })
  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus

  @ApiPropertyOptional({
    description: 'Filter by story type',
    enum: StoryType,
    example: StoryType.STORY
  })
  @IsOptional()
  @IsEnum(StoryType)
  type?: StoryType

  @ApiPropertyOptional({
    description: 'Filter by user ID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
  })
  @IsOptional()
  @IsUUID()
  userId?: string

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: StoryPriority,
    example: StoryPriority.HIGH
  })
  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority

  @ApiPropertyOptional({
    description: 'Filter by country ID',
    example: 1
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  countryId?: number

  @ApiPropertyOptional({
    description: 'Filter by parent story ID',
    example: 123
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  parentId?: number

  @ApiPropertyOptional({
    description: 'Filter by category IDs (comma-separated)',
    example: 'e37e94ea-c33c-4b06-8582-370058d81d7e,43903de1-9023-40ed-935f-0f2780e6291f'
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(id => id.trim())
    }
    return value
  })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]

  @ApiPropertyOptional({
    description: 'Filter by date from (ISO string)',
    example: '2024-01-01T00:00:00Z'
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string

  @ApiPropertyOptional({
    description: 'Filter by date to (ISO string)',
    example: '2024-12-31T23:59:59Z'
  })
  @IsOptional()
  @IsDateString()
  toDate?: string

  @ApiPropertyOptional({
    description: 'Search in title and details',
    example: 'breaking news'
  })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({
    description: 'Include deleted stories',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDeleted?: boolean

  @ApiPropertyOptional({
    description: 'Page number',
    minimum: 1,
    default: 1,
    example: 1
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20

  @ApiPropertyOptional({
    description: 'Sort by field',
    example: 'createdAt'
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt'

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: StorySortOrder,
    default: StorySortOrder.DESC,
    example: StorySortOrder.DESC
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(StorySortOrder)
  sortOrder?: StorySortOrder = StorySortOrder.DESC
}
