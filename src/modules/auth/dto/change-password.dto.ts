import { IsString, MinLength, Matches } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * DTO for users forced to change their password
 * 
 * Used when:
 * - Admin reset user password
 * - Temporary password expired
 * - Security incident requires password change
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password (temporary or existing)',
    example: 'CurrentPass@123',
  })
  @IsString()
  currentPassword: string

  @ApiProperty({
    description: 'New password (must meet strength requirements)',
    example: 'NewSecure@Pass456',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
  })
  newPassword: string

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'NewSecure@Pass456',
  })
  @IsString()
  confirmPassword: string
}
