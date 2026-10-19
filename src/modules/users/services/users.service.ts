import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'

import { RoleRepository } from '@modules/acl'
import {
  assertAttachmentUsable,
  AttachmentRepository,
  AttachmentVisibilityService,
  S3Service
} from '@modules/attachments'

import { UserProfileDto } from '../dto/user-profile.dto'
import { User } from '../entities/user.entity'
import { UserRepository } from '../repositories/user.repository'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly s3Service: S3Service,
    private readonly attachmentVisibility: AttachmentVisibilityService,
    private readonly roleRepository: RoleRepository
  ) {}

  /** Password hash for credential checks only; never returned by regular lookups. */
  getPasswordHash(id: string): Promise<string | null> {
    return this.userRepository.findPasswordHash(id)
  }

  findByEmail(email: string, bypassCache = false): Promise<User | null> {
    return this.userRepository.findByEmail(email, bypassCache)
  }

  /**
   * Fresh read: callers use User methods (isSuperAdmin, canManageUser...), and a cache
   * hit is a plain JSON object without them
   */
  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id, { bypassCache: true })
  }

  /**
   * Get user profile (safe DTO without sensitive fields)
   */
  async getUserProfile(id: string): Promise<UserProfileDto | null> {
    // Fresh read (the DTO mapping calls User methods; a cache hit is plain JSON). The
    // profile is not cached either: presigning the image URL is a local HMAC.
    const user = await this.userRepository.findById(id, { bypassCache: true })
    if (!user) return null

    const profile = UserProfileDto.fromEntity(user)

    if (user.profileImage?.path) {
      try {
        profile.profileImageUrl = user.profileImage.isPublic
          ? this.s3Service.getPublicUrl(user.profileImage.path)
          : await this.s3Service.getPresignedUrl(user.profileImage.path, 86400)
      } catch {
        // A broken image link must not fail the profile request
        profile.profileImageUrl = null
      }
    }

    return profile
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

    const primaryRoleId = payload.primaryRoleId ?? (await this.roleRepository.findDefaultRoleId())

    return this.userRepository.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      mobileNumber: payload.mobileNumber,
      passwordHash,
      primaryRoleId,
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

    return this.userRepository.update(id, data)
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
    assertAttachmentUsable(attachment)

    // Verify it's an image
    if (!attachment.mimeType.startsWith('image/')) {
      throw new BadRequestException('Attachment must be an image')
    }

    // Profile images are public: every stored object's ACL, not just the flag
    await this.attachmentVisibility.setVisibility(attachment, true)

    // Update user with the profile image
    const updated = await this.userRepository.update(userId, { profileImageId: attachmentId })
    return updated
  }

  /**
   * Remove user profile image
   */
  async removeProfileImage(userId: string): Promise<User | null> {
    const updated = await this.userRepository.update(userId, { profileImageId: null })
    return updated
  }
}
