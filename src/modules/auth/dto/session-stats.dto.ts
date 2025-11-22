import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator'

/**
 * Device statistics breakdown
 */
export class DeviceStatsDto {
  @ApiProperty({
    description: 'Device type',
    example: 'desktop'
  })
  @IsString()
  deviceType: string

  @ApiProperty({
    description: 'Number of sessions for this device type',
    example: 5
  })
  @IsInt()
  @Min(0)
  count: number

  @ApiPropertyOptional({
    description: 'Percentage of total sessions',
    example: 50.0
  })
  percentage?: number
}

/**
 * Security level statistics breakdown
 */
export class SecurityLevelStatsDto {
  @ApiProperty({
    description: 'Security risk level',
    example: 'low'
  })
  @IsString()
  securityLevel: string

  @ApiProperty({
    description: 'Number of sessions at this security level',
    example: 8
  })
  @IsInt()
  @Min(0)
  count: number

  @ApiPropertyOptional({
    description: 'Percentage of total sessions',
    example: 80.0
  })
  percentage?: number
}

/**
 * Session type statistics breakdown
 */
export class SessionTypeStatsDto {
  @ApiProperty({
    description: 'Session type',
    example: 'standard'
  })
  @IsString()
  sessionType: string

  @ApiProperty({
    description: 'Number of sessions of this type',
    example: 7
  })
  @IsInt()
  @Min(0)
  count: number

  @ApiPropertyOptional({
    description: 'Percentage of total sessions',
    example: 70.0
  })
  percentage?: number
}

/**
 * Comprehensive session statistics response DTO
 * Used in SessionsController.getSessionStats()
 */
export class SessionStatsDto {
  @ApiProperty({
    description: 'Total number of sessions',
    example: 10
  })
  @IsInt()
  @Min(0)
  totalSessions: number

  @ApiProperty({
    description: 'Number of active sessions',
    example: 8
  })
  @IsInt()
  @Min(0)
  activeSessions: number

  @ApiProperty({
    description: 'Number of expired sessions',
    example: 2
  })
  @IsInt()
  @Min(0)
  expiredSessions: number

  @ApiProperty({
    description: 'Number of revoked sessions',
    example: 0
  })
  @IsInt()
  @Min(0)
  revokedSessions: number

  @ApiProperty({
    description: 'Number of sessions expiring soon (within 24 hours)',
    example: 1
  })
  @IsInt()
  @Min(0)
  expiringSoon: number

  @ApiProperty({
    description: 'Number of suspicious sessions',
    example: 0
  })
  @IsInt()
  @Min(0)
  suspiciousSessions: number

  @ApiProperty({
    description: 'Breakdown by device type',
    type: [DeviceStatsDto],
    example: [
      { deviceType: 'desktop', count: 5, percentage: 50.0 },
      { deviceType: 'mobile', count: 3, percentage: 30.0 }
    ]
  })
  @IsArray()
  @Type(() => DeviceStatsDto)
  deviceStats: DeviceStatsDto[]

  @ApiProperty({
    description: 'Breakdown by security level',
    type: [SecurityLevelStatsDto],
    example: [
      { securityLevel: 'low', count: 8, percentage: 80.0 },
      { securityLevel: 'medium', count: 2, percentage: 20.0 }
    ]
  })
  @IsArray()
  @Type(() => SecurityLevelStatsDto)
  securityStats: SecurityLevelStatsDto[]

  @ApiProperty({
    description: 'Breakdown by session type',
    type: [SessionTypeStatsDto],
    example: [
      { sessionType: 'standard', count: 7, percentage: 70.0 },
      { sessionType: 'mobile', count: 3, percentage: 30.0 }
    ]
  })
  @IsArray()
  @Type(() => SessionTypeStatsDto)
  typeStats: SessionTypeStatsDto[]

  @ApiPropertyOptional({
    description: 'Average session age in hours',
    example: 48.5
  })
  averageSessionAge?: number

  @ApiPropertyOptional({
    description: 'Most recent session creation timestamp',
    example: '2025-10-24T10:30:00Z'
  })
  mostRecentSession?: Date

  @ApiPropertyOptional({
    description: 'Oldest active session timestamp',
    example: '2025-10-20T08:15:00Z'
  })
  oldestSession?: Date

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { maxConcurrentSessions: 5, currentConcurrentSessions: 3 }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>
}
