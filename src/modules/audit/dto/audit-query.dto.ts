import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator'

import { AuditAction, AuditSeverity, AuditStatus } from '../entities/audit-log.entity'

export class SearchAuditLogsDto {
  @ApiPropertyOptional({ description: 'User ID to filter by' })
  @IsOptional()
  @IsString()
  userId?: string

  @ApiPropertyOptional({
    enum: AuditAction,
    description: 'Action type(s) to filter by',
    isArray: true
  })
  @IsOptional()
  @IsEnum(AuditAction, { each: true })
  @IsArray()
  action?: AuditAction[]

  @ApiPropertyOptional({ description: 'Entity type to filter by (e.g., Story, User)' })
  @IsOptional()
  @IsString()
  entityType?: string

  @ApiPropertyOptional({ description: 'Entity ID to filter by' })
  @IsOptional()
  @IsString()
  entityId?: string

  @ApiPropertyOptional({ description: 'IP address to filter by' })
  @IsOptional()
  @IsString()
  ipAddress?: string

  @ApiPropertyOptional({
    enum: AuditSeverity,
    description: 'Severity level(s) to filter by',
    isArray: true
  })
  @IsOptional()
  @IsEnum(AuditSeverity, { each: true })
  @IsArray()
  severity?: AuditSeverity[]

  @ApiPropertyOptional({
    enum: AuditStatus,
    description: 'Status to filter by',
    isArray: true
  })
  @IsOptional()
  @IsEnum(AuditStatus, { each: true })
  @IsArray()
  status?: AuditStatus[]

  @ApiPropertyOptional({ description: 'Start date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ description: 'End date for filtering (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string

  @ApiPropertyOptional({ description: 'Filter archived logs', default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isArchived?: boolean

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @ApiPropertyOptional({ description: 'Items per page', default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50
}

export class GetUserActivityDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string

  @ApiPropertyOptional({ description: 'Maximum number of logs', default: 50, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 50
}

export class GetEntityHistoryDto {
  @ApiPropertyOptional({ description: 'Maximum number of changes', default: 100, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 100
}

export class GetStatisticsDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class GetByActionDto {
  @ApiPropertyOptional({ description: 'Maximum number of logs', default: 100, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 100
}

export class GetByIpAddressDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string
}

export class DetectSuspiciousActivityDto {
  @ApiPropertyOptional({ description: 'Time window in minutes', default: 60, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440) // Max 24 hours
  @Type(() => Number)
  timeWindowMinutes?: number = 60
}
