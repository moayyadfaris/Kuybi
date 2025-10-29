import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsUUID,
  IsDateString,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { StoryType, StoryStatus, StoryPriority } from '../entities/story.entity'

export class CreateStoryDto {
  @ApiProperty({
    description: 'Story title',
    minLength: 3,
    maxLength: 200,
    example: 'Breaking News: Major Event'
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({
    description: 'Story details/content',
    minLength: 10,
    maxLength: 10000,
    example: 'Detailed story content...'
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  details?: string

  @ApiProperty({
    description: 'Story type',
    enum: StoryType,
    default: StoryType.STORY,
    example: StoryType.STORY
  })
  @IsEnum(StoryType)
  type: StoryType

  @ApiProperty({
    description: 'Story status',
    enum: StoryStatus,
    default: StoryStatus.DRAFT,
    example: StoryStatus.DRAFT
  })
  @IsEnum(StoryStatus)
  status: StoryStatus

  @ApiPropertyOptional({
    description: 'Story start time',
    example: '2024-01-15T10:00:00Z'
  })
  @IsOptional()
  @IsDateString()
  fromTime?: string

  @ApiPropertyOptional({
    description: 'Story end time',
    example: '2024-01-15T18:00:00Z'
  })
  @IsOptional()
  @IsDateString()
  toTime?: string

  @ApiProperty({
    description: 'Story priority',
    enum: StoryPriority,
    default: StoryPriority.NORMAL,
    example: StoryPriority.NORMAL
  })
  @IsEnum(StoryPriority)
  priority: StoryPriority

  @ApiPropertyOptional({
    description: 'Parent story ID (for threaded stories)',
    example: 123
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { source: 'mobile', verified: true }
  })
  @IsOptional()
  metadata?: Record<string, any>

  @ApiPropertyOptional({
    description: 'Internal notes (admin only)',
    example: 'Needs fact-checking'
  })
  @IsOptional()
  @IsString()
  internalNotes?: string

  @ApiPropertyOptional({
    description: 'Latitude coordinate',
    minimum: -90,
    maximum: 90,
    example: 40.7128
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @ApiPropertyOptional({
    description: 'Longitude coordinate',
    minimum: -180,
    maximum: 180,
    example: -74.006
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number

  @ApiPropertyOptional({
    description: 'Full address',
    maxLength: 255,
    example: '123 Main St, New York'
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string

  @ApiPropertyOptional({
    description: 'City name',
    maxLength: 100,
    example: 'New York'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({
    description: 'Region/State name',
    maxLength: 100,
    example: 'New York'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string

  @ApiPropertyOptional({
    description: 'Country ID',
    example: 1
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  countryId?: number

  @ApiPropertyOptional({
    description: 'Array of category IDs to assign to the story',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    maxItems: 20
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  categoryIds?: string[]

  @ApiPropertyOptional({
    description: 'Array of tag IDs to assign to the story',
    type: [Number],
    example: [1, 2, 3],
    maxItems: 50
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  tagIds?: number[]

  @ApiPropertyOptional({
    description: "Array of tag names to assign to the story (will create tags if they don't exist)",
    type: [String],
    example: ['sports', 'economy', 'breaking-news'],
    maxItems: 50
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(50, { each: true })
  tags?: string[]
}
