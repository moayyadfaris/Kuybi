import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { User } from '@modules/users/entities/user.entity'
import { UserRepository } from '@core/database/repositories/user.repository'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { S3Service } from '@modules/attachments/services/s3.service'
import { CacheService } from '@core/cache/services/cache.service'
import { UserProfileDto } from '@modules/users/dto/user-profile.dto'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AttachmentMetadata } from '@modules/attachments/utils/attachment-image.util'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly s3Service: S3Service,
    private readonly cacheService: CacheService
  ) {}

  findByEmail(email: string, bypassCache = false): Promise<User | null> {
    return this.userRepository.findByEmail(email, bypassCache)
  }

  async findById(id: string): Promise<User | null> {
    const cacheKey = `user:profile:${id}`
    return this.cacheService.wrap<User>(
      cacheKey,
      async () => this.userRepository.findById(id, { bypassCache: true }),
      900 // 15 min TTL
    )
  }

  /**
   * Get user profile (safe DTO without sensitive fields)
   */
  async getUserProfile(id: string): Promise<UserProfileDto | null> {
    const cacheKey = `user:profile:safe:${id}`
    return this.cacheService.wrap<UserProfileDto>(
      cacheKey,
      async () => {
        const user = await this.userRepository.findById(id, { bypassCache: true })
        if (!user) return null

        const profile = UserProfileDto.fromEntity(user)

        // Generate presigned URL for profile image if exists
        if (user.profileImage?.path) {
          try {
            profile.profileImageUrl = user.profileImage.isPublic
              ? this.s3Service.getPublicUrl(user.profileImage.path)
              : await this.s3Service.getPresignedUrl(user.profileImage.path, 86400)
          } catch (error) {
            // Log error but don't fail the request
            console.error('Failed to generate profile image URL:', error)
            profile.profileImageUrl = null
          }
        }

        return profile
      },
      900 // 15 min TTL
    )
  }

  async createUser(payload: {
    name: string
    email: string
    mobileNumber: string
    password: string
    primaryRoleId?: number
    isVerified?: boolean
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(payload.password, 10)

    // Default to role ID 3 (user role) if not specified
    // Role IDs: 1=super-admin, 2=admin, 3=user (from ACL seeder)
    return this.userRepository.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      mobileNumber: payload.mobileNumber,
      passwordHash,
      primaryRoleId: payload.primaryRoleId ?? 4, // Default to 'user' role (ID 4)
      isVerified: payload.isVerified ?? false
    })
  }

  async updateUser(id: string, data: Partial<User>, currentUser?: User): Promise<User | null> {
    // Check if current user can manage target user (role hierarchy)
    if (currentUser && !currentUser.isSuperAdmin()) {
      const targetUser = await this.userRepository.findById(id, { bypassCache: true })
      if (targetUser && !currentUser.canManageUser(targetUser)) {
        throw new ForbiddenException(
          'Cannot update user with equal or higher role priority. Contact a super-admin.'
        )
      }
    }

    const updated = await this.userRepository.update(id, data)
    // Invalidate both internal and safe profile caches
    await this.cacheService.del(`user:profile:${id}`)
    await this.cacheService.del(`user:profile:safe:${id}`)
    return updated
  }

  async deleteUser(id: string, currentUser?: User): Promise<boolean> {
    // Check if current user can manage target user (role hierarchy)
    if (currentUser && !currentUser.isSuperAdmin()) {
      const targetUser = await this.userRepository.findById(id, { bypassCache: true })
      if (targetUser && !currentUser.canManageUser(targetUser)) {
        throw new ForbiddenException(
          'Cannot delete user with equal or higher role priority. Contact a super-admin.'
        )
      }
    }

    return this.userRepository.delete(id)
  }

  async searchUsers(query: {
    search?: string
    role?: string
    isActive?: boolean
    isVerified?: boolean
    limit?: number
    offset?: number
  }): Promise<[User[], number]> {
    return this.userRepository.search(query)
  }

  async getUserStats() {
    return this.userRepository.getStats()
  }

  async updateVerification(id: string, isVerified: boolean): Promise<User | null> {
    return this.userRepository.updateVerification(id, isVerified)
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10)
    return this.userRepository.updatePassword(id, passwordHash)
  }

  /**
   * Update user profile image
   */
  async updateProfileImage(userId: string, attachmentId: string): Promise<User | null> {
    // Verify the attachment exists and belongs to the user
    const attachment = await this.attachmentRepository.findById(attachmentId)
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    if (attachment.userId !== userId) {
      throw new BadRequestException('Attachment does not belong to this user')
    }

    // Verify it's an image
    if (!attachment.mimeType.startsWith('image/')) {
      throw new BadRequestException('Attachment must be an image')
    }

    await this.ensureAttachmentPublic(attachment)

    // Update user with the profile image
    const updated = await this.userRepository.update(userId, { profileImageId: attachmentId })

    // Invalidate caches
    await this.cacheService.del(`user:profile:${userId}`)
    await this.cacheService.del(`user:profile:safe:${userId}`)

    return updated
  }

  /**
   * Remove user profile image
   */
  async removeProfileImage(userId: string): Promise<User | null> {
    const updated = await this.userRepository.update(userId, { profileImageId: null })

    // Invalidate caches
    await this.cacheService.del(`user:profile:${userId}`)
    await this.cacheService.del(`user:profile:safe:${userId}`)

    return updated
  }

  private async ensureAttachmentPublic(attachment: Attachment): Promise<void> {
    if (attachment.isPublic) {
      return
    }

    await this.s3Service.makePublic(attachment.path)

    if (attachment.thumbnailPath) {
      await this.s3Service.makePublic(attachment.thumbnailPath)
    }

    const metadata = (attachment.metadata || {}) as AttachmentMetadata

    const thumbnails = metadata.thumbnails
    if (thumbnails) {
      const thumbnailKeys = Object.values(thumbnails)
        .map(thumb => thumb?.key)
        .filter((key): key is string => Boolean(key))

      await Promise.all(thumbnailKeys.map(key => this.s3Service.makePublic(key)))
    }

    const optimization = metadata.optimization
    const placeholderKey = optimization?.placeholderKey
    if (placeholderKey) {
      await this.s3Service.makePublic(placeholderKey)
    }

    if (optimization || placeholderKey) {
      metadata.optimization = {
        ...(optimization || {}),
        placeholderKey
      }
    }

    attachment.isPublic = true
    attachment.metadata = metadata

    await this.attachmentRepository.update(attachment.id, {
      isPublic: true,
      metadata
    })
  }
}
