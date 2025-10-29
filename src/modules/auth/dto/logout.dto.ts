import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator'

const REFRESH_TOKEN_REGEX = /^[0-9a-fA-F-]{36}\.[0-9a-fA-F-]{36}$/
const LOGOUT_REASONS = [
  'user_initiated',
  'security_concern',
  'admin_forced',
  'token_refresh'
] as const

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token to invalidate' })
  @IsString()
  @Matches(REFRESH_TOKEN_REGEX, { message: 'refreshToken must be in the format <uuid>.<uuid>' })
  refreshToken: string

  @ApiProperty({ description: 'Logout from all active sessions', default: false, required: false })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    const normalized = value.toString().toLowerCase()
    return ['true', '1', 'yes'].includes(normalized)
  })
  @IsBoolean()
  logoutAll = false

  @ApiProperty({ description: 'Reason for logout', required: false, enum: LOGOUT_REASONS })
  @IsOptional()
  @IsIn(LOGOUT_REASONS)
  reason?: (typeof LOGOUT_REASONS)[number]
}
