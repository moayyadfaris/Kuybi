import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNumber,
  Min
} from 'class-validator'

/**
 * Admin Update User DTO
 *
 * Allows super-admin to update any user field including sensitive fields
 * that regular users cannot modify (isActive, isVerified, role assignment, etc.)
 */
export class AdminUpdateUserDto {
  @ApiPropertyOptional({
    description: 'User name',
    example: 'John Doe',
    minLength: 1,
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string

  @ApiPropertyOptional({
    description: 'User email',
    example: 'john.doe@example.com',
    maxLength: 50
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(50)
  email?: string

  @ApiPropertyOptional({
    description: 'Mobile number',
    example: '+1234567890',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Mobile number must be a valid international format (E.164)'
  })
  @MaxLength(50)
  mobileNumber?: string

  @ApiPropertyOptional({
    description: 'Primary role ID to assign to user',
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  primaryRoleId?: number

  @ApiPropertyOptional({
    description: 'Is user account active',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Is user verified',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean

  @ApiPropertyOptional({
    description: 'Is email verified',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean

  @ApiPropertyOptional({
    description: 'Force user to change password on next login',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  forcePasswordChange?: boolean

  @ApiPropertyOptional({
    description: 'Is account locked',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean

  @ApiPropertyOptional({
    description: 'Reason for account lock',
    example: 'ADMIN_LOCK',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lockReason?: string

  @ApiPropertyOptional({
    description: 'Reset failed login attempts counter',
    example: 0,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  failedLoginAttempts?: number

  @ApiPropertyOptional({
    description: 'Reason for this update (for audit trail)',
    example: 'Correcting user information per support ticket #12345',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

/**
 * Updated User Data DTO
 */
export class UpdatedUserDataDto {
  @ApiProperty({ description: 'User ID', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  name: string

  @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
  email: string

  @ApiProperty({ description: 'Mobile number', example: '+1234567890' })
  mobileNumber: string

  @ApiProperty({ description: 'User role name', example: 'ROLE_USER' })
  role: string

  @ApiProperty({ description: 'Primary role ID', example: 1 })
  primaryRoleId: number

  @ApiProperty({ description: 'Is user active', example: true })
  isActive: boolean

  @ApiProperty({ description: 'Is user verified', example: true })
  isVerified: boolean

  @ApiProperty({ description: 'Is email verified', example: true })
  isEmailVerified: boolean

  @ApiProperty({ description: 'Force password change on next login', example: false })
  forcePasswordChange: boolean

  @ApiProperty({ description: 'Is account locked', example: false })
  isLocked: boolean

  @ApiProperty({ description: 'Failed login attempts', example: 0 })
  failedLoginAttempts: number

  @ApiProperty({ description: 'Last update timestamp', example: '2025-11-10T12:00:00.000Z' })
  updatedAt: Date
}

/**
 * Admin Update User Response DTO
 *
 * Response after successfully updating a user
 */
export class AdminUpdateUserResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'User updated successfully'
  })
  message: string

  @ApiProperty({
    description: 'Updated user profile',
    type: UpdatedUserDataDto
  })
  user: UpdatedUserDataDto

  @ApiProperty({
    description: 'Admin who performed the update',
    example: 'admin@kuybi.dev'
  })
  updatedBy: string

  @ApiProperty({
    description: 'Update timestamp',
    example: '2025-11-10T12:00:00.000Z'
  })
  updatedAt: Date

  @ApiPropertyOptional({
    description: 'Reason for update',
    example: 'Correcting user information per support ticket #12345'
  })
  reason?: string
}
