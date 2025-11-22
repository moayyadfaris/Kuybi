import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'

export class CreateTagDto {
  @ApiProperty({
    description: 'Tag name',
    minLength: 2,
    maxLength: 200,
    example: 'breaking-news'
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string

  @ApiPropertyOptional({
    description: 'Tag color in hex format',
    example: '#FF5733',
    pattern: '^#[0-9A-Fa-f]{6}$'
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color (e.g., #FF5733)'
  })
  color?: string

  @ApiPropertyOptional({
    description: 'Sort order for tag display',
    example: 0
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @ApiPropertyOptional({
    description: 'Whether this is a system tag',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { category: 'news', importance: 'high' }
  })
  @IsOptional()
  metadata?: Record<string, any>
}
