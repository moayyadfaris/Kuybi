import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator'

/**
 * DTO for admin to reset user password (system generates password)
 *
 * Best Practice: System-generated passwords are more secure
 * and prevent weak passwords from being set by admins
 */
export class AdminResetPasswordDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User ID to reset password for'
  })
  @IsUUID()
  userId: string

  @ApiPropertyOptional({
    example: true,
    description: 'Force user to change password on next login (recommended: true)',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  forcePasswordChange?: boolean

  @ApiPropertyOptional({
    example: 'User forgot password and requested help',
    description: 'Reason for password reset (for audit trail)'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

/**
 * DTO for admin to set a specific password for user
 *
 * Use Case: Emergency access, temporary passwords, etc.
 * Security: Still requires strong password validation
 */
export class AdminSetPasswordDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User ID to set password for'
  })
  @IsUUID()
  userId: string

  @ApiProperty({
    example: 'TempSecure@Pass123',
    description: 'New password (must meet security requirements)'
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
  })
  newPassword: string

  @ApiPropertyOptional({
    example: true,
    description: 'Force user to change password on next login (recommended: true)',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  forcePasswordChange?: boolean

  @ApiPropertyOptional({
    example: 'Emergency access required for account recovery',
    description: 'Reason for setting password (for audit trail)'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string

  @ApiPropertyOptional({
    example: false,
    description: 'Send notification email to user about password change',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean
}

/**
 * DTO for response after admin password reset/set
 */
export class AdminPasswordResetResponseDto {
  userId: string
  email: string
  temporaryPassword?: string // Only returned for reset (system-generated)
  forcePasswordChange: boolean
  changedBy: string
  changedAt: Date
  reason?: string
}
