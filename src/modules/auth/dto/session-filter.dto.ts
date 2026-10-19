import { ApiPropertyOptional } from '@nestjs/swagger'
import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { DeviceType, SessionType } from './create-session.dto'

export enum SessionSortBy {
  CREATED_AT = 'createdAt',
  LAST_ACTIVITY = 'lastActivityAt',
  EXPIRES_AT = 'expiresAt',
  SECURITY_LEVEL = 'securityLevel'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export enum SessionStatus {
  ACTIVE = 'active',
  /** Active and expiring within 24 hours */
  EXPIRING = 'expiring',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ALL = 'all'
}

/**
 * DTO for filtering and paginating session queries
 * Used in SessionsController.listSessions()
 */
export class SessionFilterDto {
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
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10

  @ApiPropertyOptional({
    description: 'Include expired sessions in results',
    example: false,
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeExpired?: boolean = false

  @ApiPropertyOptional({
    description: 'Include deleted (soft-deleted) sessions',
    example: false,
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeDeleted?: boolean = false

  @ApiPropertyOptional({
    description: 'Include risk assessment in response',
    example: true,
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeRiskAssessment?: boolean = false

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: SessionSortBy,
    example: SessionSortBy.CREATED_AT,
    default: SessionSortBy.CREATED_AT
  })
  @IsOptional()
  @IsEnum(SessionSortBy)
  sortBy?: SessionSortBy = SessionSortBy.CREATED_AT

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    example: SortOrder.DESC,
    default: SortOrder.DESC
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC

  @ApiPropertyOptional({
    description: 'Filter by device type',
    enum: DeviceType,
    example: DeviceType.MOBILE,
    required: false
  })
  @IsOptional()
  @IsEnum(DeviceType)
  filterByDevice?: DeviceType

  @ApiPropertyOptional({
    description: 'Filter by session type',
    enum: SessionType,
    example: SessionType.STANDARD,
    required: false
  })
  @IsOptional()
  @IsEnum(SessionType)
  filterByType?: SessionType

  @ApiPropertyOptional({
    description:
      'Filter by session status. Without it the list holds live sessions, or every session with includeExpired',
    enum: SessionStatus,
    example: SessionStatus.ACTIVE
  })
  @IsOptional()
  @IsEnum(SessionStatus)
  filterByStatus?: SessionStatus

  @ApiPropertyOptional({
    description: 'Mask the last two parts of each IP address',
    default: false
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  anonymizeData?: boolean = false

  @ApiPropertyOptional({
    description: 'Filter by security level',
    enum: ['low', 'medium', 'high', 'critical'],
    example: 'high',
    required: false
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  filterBySecurityLevel?: 'low' | 'medium' | 'high' | 'critical'

  @ApiPropertyOptional({
    description: 'Search by IP address (partial match)',
    example: '192.168',
    required: false
  })
  @IsOptional()
  @IsString()
  searchByIp?: string

  @ApiPropertyOptional({
    description: 'Search by device fingerprint (partial match)',
    example: 'chrome-windows',
    required: false
  })
  @IsOptional()
  @IsString()
  searchByFingerprint?: string
}
