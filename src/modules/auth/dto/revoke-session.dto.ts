import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

import { DeviceType } from './create-session.dto'

export enum RevocationReason {
  USER_LOGOUT = 'user_logout',
  USER_LOGOUT_ALL = 'user_logout_all',
  SECURITY_CONCERN = 'security_concern',
  PASSWORD_CHANGE = 'password_change',
  ADMIN_ACTION = 'admin_action',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  TOKEN_EXPIRED = 'token_expired',
  INVALID_TOKEN = 'invalid_token',
  SESSION_TIMEOUT = 'session_timeout',
  DEVICE_CHANGE = 'device_change',
  IP_CHANGE = 'ip_change',
  OTHER = 'other'
}

/**
 * DTO for revoking user sessions
 * Used in SessionsController logout endpoints
 */
export class RevokeSessionDto {
  @ApiPropertyOptional({
    description: 'Revoke all user sessions instead of just the current one',
    example: false,
    default: false
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  logoutAll?: boolean = false

  @ApiPropertyOptional({
    description: 'Reason for session revocation',
    enum: RevocationReason,
    example: RevocationReason.USER_LOGOUT,
    default: RevocationReason.USER_LOGOUT
  })
  @IsOptional()
  @IsEnum(RevocationReason)
  reason?: RevocationReason = RevocationReason.USER_LOGOUT

  @ApiPropertyOptional({
    description: 'Additional notes about the revocation',
    example: 'User requested logout from all devices',
    maxLength: 500,
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string

  @ApiPropertyOptional({
    description: 'Soft delete instead of hard delete (keeps audit trail)',
    example: true,
    default: true
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  softDelete?: boolean = true
}

/**
 * DTO for revoking sessions by device type
 * Used in SessionsController.revokeByDevice()
 */
export class RevokeByDeviceDto {
  @ApiProperty({
    description: 'Device type(s) to revoke sessions for',
    enum: DeviceType,
    isArray: true,
    example: [DeviceType.MOBILE, DeviceType.TABLET]
  })
  @IsArray()
  @IsEnum(DeviceType, { each: true })
  deviceTypes: DeviceType[]

  @ApiPropertyOptional({
    description: 'Reason for session revocation',
    enum: RevocationReason,
    example: RevocationReason.DEVICE_CHANGE,
    default: RevocationReason.DEVICE_CHANGE
  })
  @IsOptional()
  @IsEnum(RevocationReason)
  reason?: RevocationReason = RevocationReason.DEVICE_CHANGE

  @ApiPropertyOptional({
    description: 'Additional notes about the revocation',
    example: 'Revoking mobile sessions due to device theft',
    maxLength: 500,
    required: false
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}

/**
 * Response DTO for session revocation operations
 */
export class RevokeSessionResponseDto {
  @ApiProperty({
    description: 'Whether the revocation was successful',
    example: true
  })
  @IsBoolean()
  success: boolean

  @ApiProperty({
    description: 'Number of sessions revoked',
    example: 3
  })
  sessionsRevoked: number

  @ApiProperty({
    description: 'Type of logout performed',
    example: 'all_devices'
  })
  @IsString()
  logoutType: 'current_device' | 'all_devices' | 'by_device_type'

  @ApiPropertyOptional({
    description: 'List of revoked session IDs',
    example: ['uuid-1', 'uuid-2', 'uuid-3']
  })
  @IsOptional()
  @IsArray()
  revokedSessionIds?: string[]

  @ApiProperty({
    description: 'Whether cache was cleared',
    example: true
  })
  @IsBoolean()
  cacheCleared: boolean

  @ApiPropertyOptional({
    description: 'Additional response message',
    example: 'Successfully logged out from 3 devices'
  })
  @IsOptional()
  @IsString()
  message?: string
}
