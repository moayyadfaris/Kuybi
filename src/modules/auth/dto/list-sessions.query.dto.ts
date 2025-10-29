import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator'

const SORT_FIELDS = ['createdAt', 'expiresAt', 'ipAddress'] as const
const SORT_ORDERS = ['asc', 'desc'] as const
const DEVICE_TYPES = ['mobile', 'desktop', 'tablet', 'bot'] as const
const STATUS_FILTERS = ['active', 'expired', 'expiring'] as const

export class ListSessionsQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @Transform(({ value }) => {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  })
  @IsInt()
  @IsOptional()
  page = 0

  @ApiPropertyOptional({ default: 20 })
  @Transform(({ value }) => {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20
  })
  @IsInt()
  @IsOptional()
  limit = 20

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    return ['true', '1', 'yes'].includes(normalized)
  })
  @IsBoolean()
  includeExpired = false

  @ApiPropertyOptional({ enum: SORT_FIELDS })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: (typeof SORT_FIELDS)[number]

  @ApiPropertyOptional({ enum: SORT_ORDERS })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: (typeof SORT_ORDERS)[number]

  @ApiPropertyOptional({ enum: DEVICE_TYPES })
  @IsOptional()
  @IsIn(DEVICE_TYPES)
  filterByDevice?: (typeof DEVICE_TYPES)[number]

  @ApiPropertyOptional({ enum: STATUS_FILTERS })
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  filterByStatus?: (typeof STATUS_FILTERS)[number]

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    return ['true', '1', 'yes'].includes(normalized)
  })
  @IsBoolean()
  includeRiskAssessment = false

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    return ['true', '1', 'yes'].includes(normalized)
  })
  @IsBoolean()
  anonymizeData = false
}
