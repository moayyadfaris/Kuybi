import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export const TAG_SORT_FIELDS = ['name', 'sortOrder', 'createdAt'] as const

export class ListTagsQueryDto {
  @ApiPropertyOptional({ description: 'Names starting with this (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string

  @ApiPropertyOptional({ enum: TAG_SORT_FIELDS, default: 'sortOrder' })
  @IsOptional()
  @IsIn(TAG_SORT_FIELDS)
  sortBy?: (typeof TAG_SORT_FIELDS)[number]

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC'

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0
}
