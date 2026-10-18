import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'

export const TAG_SORT_FIELDS = ['name', 'sortOrder', 'createdAt'] as const

export class ListTagsQueryDto {
  @ApiPropertyOptional({ enum: TAG_SORT_FIELDS, default: 'sortOrder' })
  @IsOptional()
  @IsIn(TAG_SORT_FIELDS)
  sortBy?: (typeof TAG_SORT_FIELDS)[number]

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC'
}
