import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { User } from '@modules/users/entities/user.entity'
import { UserRepository } from '@core/database/repositories/user.repository'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { CacheService } from '@core/cache/services/cache.service'
import { UserProfileDto } from '@modules/users/dto/user-profile.dto'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly cacheService: CacheService
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email)
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
        return user ? UserProfileDto.fromEntity(user) : null
      },
      900 // 15 min TTL
    )
  }

  async createUser(payload: {
    name: string
    email: string
    mobileNumber: string
    password: string
    role?: string
    isVerified?: boolean
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(payload.password, 10)

    return this.userRepository.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      mobileNumber: payload.mobileNumber,
      passwordHash,
      role: payload.role ?? 'ROLE_USER',
      isVerified: payload.isVerified ?? false
    })
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const updated = await this.userRepository.update(id, data)
    // Invalidate both internal and safe profile caches
    await this.cacheService.del(`user:profile:${id}`)
    await this.cacheService.del(`user:profile:safe:${id}`)
    return updated
  }

  async deleteUser(id: string): Promise<boolean> {
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
}
