import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { User } from '../entities/user.entity'

/**
 * User Profile DTO
 *
 * Safe representation of user data that excludes sensitive fields.
 * Used for public-facing user profile responses.
 */
export class UserProfileDto {
  @ApiProperty({ description: 'User ID', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  name: string

  @ApiProperty({ description: 'User email', example: 'john@example.com' })
  email: string

  @ApiProperty({ description: 'Mobile number', example: '+1234567890' })
  mobileNumber: string

  @ApiProperty({ description: 'User role', example: 'ROLE_USER' })
  role: string

  @ApiProperty({ description: 'Is user active', example: true })
  isActive: boolean

  @ApiProperty({ description: 'Is email verified', example: true })
  isVerified: boolean

  @ApiProperty({ description: 'Is email verified', example: true })
  isEmailVerified: boolean

  @ApiPropertyOptional({
    description: 'Email verification date',
    example: '2025-11-01T00:00:00.000Z'
  })
  emailVerifiedAt: Date | null

  @ApiProperty({ description: 'Account creation date', example: '2025-11-01T00:00:00.000Z' })
  createdAt: Date

  @ApiProperty({ description: 'Account last update date', example: '2025-11-01T00:00:00.000Z' })
  updatedAt: Date

  @ApiPropertyOptional({
    description: 'Profile image attachment ID',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  profileImageId?: string | null

  @ApiPropertyOptional({
    description: 'Profile image URL',
    example: 'https://bucket.s3.amazonaws.com/uploads/user-id/image.jpg'
  })
  profileImageUrl?: string | null

  /**
   * Create a safe user profile DTO from a User entity
   * Excludes sensitive fields like passwordHash and forcePasswordChange
   * Note: profileImageUrl should be set separately using S3Service.getPresignedUrl()
   */
  static fromEntity(user: User): UserProfileDto {
    const profile = new UserProfileDto()
    profile.id = user.id
    profile.name = user.name
    profile.email = user.email
    profile.mobileNumber = user.mobileNumber
    profile.role = user.role
    profile.isActive = user.isActive
    profile.isVerified = user.isVerified
    profile.isEmailVerified = user.isEmailVerified
    profile.emailVerifiedAt = user.emailVerifiedAt
    profile.createdAt = user.createdAt
    profile.updatedAt = user.updatedAt
    profile.profileImageId = user.profileImageId
    profile.profileImageUrl = null // Set by service layer with presigned URL

    return profile
  }
}
