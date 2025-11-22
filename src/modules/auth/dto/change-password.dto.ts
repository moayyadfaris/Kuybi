import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator'

/**
 * DTO for users changing their password
 *
 * Used when:
 * - Admin reset user password
 * - Temporary password expired
 * - Security incident requires password change
 * - User voluntarily changes password for security
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password (temporary or existing)',
    example: 'CurrentPass@123'
  })
  @IsString()
  currentPassword: string

  @ApiProperty({
    description: 'New password (must meet strength requirements)',
    example: 'NewSecure@Pass456',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
  })
  newPassword: string

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'NewSecure@Pass456'
  })
  @IsString()
  confirmPassword: string

  @ApiPropertyOptional({
    description:
      'Invalidate all existing sessions except current one. ' +
      'If true, user will be logged out of all other devices. ' +
      'If false, only current session remains active.',
    default: true,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    // Handle string 'true'/'false' from query params
    if (typeof value === 'string') {
      return value === 'true'
    }
    return value !== false // Default to true if not specified
  })
  invalidateAllSessions?: boolean = true

  @ApiPropertyOptional({
    description:
      'Send email notification about password change. ' +
      'Recommended for security - alerts user if change was unauthorized.',
    default: true,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true'
    }
    return value !== false // Default to true
  })
  sendNotificationEmail?: boolean = true
}
