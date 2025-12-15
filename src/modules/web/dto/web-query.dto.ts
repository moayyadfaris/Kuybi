import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class WebQueryDto {
  @ApiPropertyOptional({
    description: 'Search query string',
    example: 'technology'
  })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({
    description: 'Page number (starts at 1)',
    example: 1,
    minimum: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}

export class WebStoriesQueryDto extends WebQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by category slug',
    example: 'technology'
  })
  @IsOptional()
  @IsString()
  categorySlug?: string

  @ApiPropertyOptional({
    description: 'Filter by tag name',
    example: 'nodejs'
  })
  @IsOptional()
  @IsString()
  tag?: string
}
