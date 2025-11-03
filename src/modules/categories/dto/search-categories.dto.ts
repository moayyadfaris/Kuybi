import { IsOptional, IsString, IsBoolean, IsIn, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class SearchCategoriesDto {
  @ApiPropertyOptional({
    description: 'Search term to filter categories by name, slug, or description',
    example: 'technology'
  })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Include soft-deleted categories',
    example: false,
    default: false
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean

  @ApiPropertyOptional({
    description: 'Include story count for each category',
    example: true,
    default: false
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeCounts?: boolean

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'name',
    enum: ['name', 'slug', 'createdAt', 'updatedAt'],
    default: 'name'
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'slug', 'createdAt', 'updatedAt'])
  orderBy?: string

  @ApiPropertyOptional({
    description: 'Sort direction',
    example: 'ASC',
    enum: ['ASC', 'DESC'],
    default: 'ASC'
  })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  orderDirection?: 'ASC' | 'DESC'

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 50,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50
}
