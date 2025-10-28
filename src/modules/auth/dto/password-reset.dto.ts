import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

/**
 * DTO for requesting a password reset
 * 
 * Security Note: Always return success even if email doesn't exist
 * to prevent email enumeration attacks
 */
export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address associated with the account',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string
}

/**
 * DTO for validating a password reset token
 * 
 * Optional endpoint - frontend can use this to check token validity
 * before showing the reset form
 */
export class ValidateResetTokenDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Password reset token from email',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string
}

/**
 * DTO for resetting password with token
 * 
 * Enforces same password strength requirements as registration
 */
export class ResetPasswordDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Password reset token from email',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string

  @ApiProperty({
    example: 'NewSecure@Pass123',
    description: 'New password (min 8 chars, must contain uppercase, lowercase, number, and special character)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    },
  )
  newPassword: string
}
