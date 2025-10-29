import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsObject, IsDate, IsIP, MaxLength, IsString } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * DTO for updating an existing session
 * Used for partial updates to session metadata and activity tracking
 */
export class UpdateSessionDto {
  @ApiPropertyOptional({
    description: 'Last activity timestamp',
    example: '2025-10-24T10:30:00Z',
    type: Date,
    required: false
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastActivityAt?: Date

  @ApiPropertyOptional({
    description: 'Current IP address (for tracking IP changes)',
    example: '192.168.1.101',
    required: false
  })
  @IsOptional()
  @IsIP()
  ipAddress?: string

  @ApiPropertyOptional({
    description: 'Updated user agent string',
    example: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)...',
    maxLength: 500,
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string

  @ApiPropertyOptional({
    description: 'Additional metadata to merge with existing session metadata',
    example: { lastPage: '/dashboard', activityCount: 25 },
    required: false
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  metadata?: Record<string, any>

  @ApiPropertyOptional({
    description: 'Updated device information',
    example: {
      browser: 'Safari',
      browserVersion: '15.0',
      os: 'iOS',
      osVersion: '15.0'
    },
    required: false
  })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  deviceInfo?: Record<string, any>
}
