import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import { PaginationQueryDto } from '@shared/dto/pagination-query.dto'

const ORDER_FIELDS = ['name', 'continent', 'currencyCode', 'phonecode']
const ORDER_DIRECTIONS = ['asc', 'desc'] as const

export class ListCountriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search across name, nicename, iso, iso3' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filter by continent', example: 'Europe' })
  @IsOptional()
  @IsString()
  continent?: string

  @ApiPropertyOptional({ description: 'Filter active countries only', type: Boolean })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.toLowerCase()
      if (['true', '1', 'yes'].includes(normalized)) return true
      if (['false', '0', 'no'].includes(normalized)) return false
    }
    return undefined
  })
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
