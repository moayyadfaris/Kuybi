import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator'

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Technology',
    minLength: 2,
    maxLength: 120
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string

  @ApiPropertyOptional({
    description: 'URL-friendly slug (kebab-case). Auto-generated from name if not provided.',
    example: 'technology',
    pattern: '^[a-z0-9-]+$',
    minLength: 2,
    maxLength: 140
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be kebab-case (lowercase letters, numbers, and hyphens only)'
  })
  slug?: string

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Stories related to technology and innovation',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({
    description: 'Whether the category is active',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Additional metadata for the category',
    example: { color: '#FF5733', icon: 'tech-icon' }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}
