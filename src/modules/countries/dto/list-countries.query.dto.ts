import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { PaginationQueryDto } from '@shared/dto/pagination-query.dto'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator'

import { COUNTRY_SORT_FIELDS } from '../repositories/country.repository'

const ORDER_FIELDS = [...COUNTRY_SORT_FIELDS]
const ORDER_DIRECTIONS = ['asc', 'desc'] as const

export class ListCountriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Matches name, nicename, iso or iso3 (contains, case-insensitive)'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string

  @ApiPropertyOptional({ description: 'Filter by continent', example: 'Europe' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  continent?: string

  @ApiPropertyOptional({ description: 'Filter active countries only', type: Boolean })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({ description: 'Comma separated list of fields to return' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((field: string) => field.trim())
        .filter((field: string) => field.length > 0)
    }
    return value
  })
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  fields?: string[]

  @ApiPropertyOptional({ enum: ORDER_FIELDS })
  @IsOptional()
  @IsIn(ORDER_FIELDS)
  orderBy?: string

  @ApiPropertyOptional({ enum: ORDER_DIRECTIONS })
  @IsOptional()
  @IsIn(ORDER_DIRECTIONS)
  orderDirection?: (typeof ORDER_DIRECTIONS)[number]
}
