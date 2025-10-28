import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, FindOptionsWhere, Like, ILike, In } from 'typeorm'
import { BaseRepository } from './base.repository'
import { User } from '@modules/users/entities/user.entity'
import { CacheService } from '../../cache/services/cache.service'

/**
 * User Repository
 * 
 * Handles all database operations for User entity with caching.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected entityName = 'user'
  protected defaultTTL = 900 // 15 minutes for user data

  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
    cacheService: CacheService,
  ) {
    super(repository, cacheService)
  }

  /**
   * Find user by email with caching
   */
  async findByEmail(email: string): Promise<User | null> {
    const cacheKey = this.buildCacheKey('email', email.toLowerCase())

    return this.cacheService.wrap<User>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { email: email.toLowerCase() } })
      },
      this.defaultTTL,
    )
  }

  /**
   * Find user by mobile number with caching
   */
  async findByMobile(mobileNumber: string): Promise<User | null> {
    const cacheKey = this.buildCacheKey('mobile', mobileNumber)

    return this.cacheService.wrap<User>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { mobileNumber } })
      },
      this.defaultTTL,
    )
  }

  /**
   * Find users by role with caching
   */
  async findByRole(role: string, options?: { limit?: number; offset?: number }): Promise<User[]> {
    const cacheKey = this.buildCacheKey(
      'role',
      role,
      `limit:${options?.limit ?? 50}`,
      `offset:${options?.offset ?? 0}`,
    )

    return this.cacheService.wrap<User[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { role },
          take: options?.limit ?? 50,
          skip: options?.offset ?? 0,
          order: { createdAt: 'DESC' },
        })
      },
      this.defaultTTL,
    )
  }

  /**
   * Search users by name or email
   */
  async search(query: {
    search?: string
    role?: string
    isActive?: boolean
    isVerified?: boolean
    limit?: number
    offset?: number
  }): Promise<[User[], number]> {
    const qb = this.repository.createQueryBuilder('user')

    if (query.search) {
      qb.where('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      })
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role })
    }

    if (query.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive })
    }

    if (query.isVerified !== undefined) {
      qb.andWhere('user.isVerified = :isVerified', { isVerified: query.isVerified })
    }

    qb.orderBy('user.createdAt', 'DESC')
      .take(query.limit ?? 50)
      .skip(query.offset ?? 0)

    return qb.getManyAndCount()
  }

  /**
   * Find active users
   */
  async findActive(options?: { limit?: number; offset?: number }): Promise<User[]> {
    const cacheKey = this.buildCacheKey(
      'active',
      `limit:${options?.limit ?? 50}`,
      `offset:${options?.offset ?? 0}`,
    )

    return this.cacheService.wrap<User[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true },
          take: options?.limit ?? 50,
          skip: options?.offset ?? 0,
          order: { createdAt: 'DESC' },
        })
      },
      this.defaultTTL,
    )
  }

  /**
   * Update user verification status
   */
  async updateVerification(id: string, isVerified: boolean): Promise<User | null> {
    await this.repository.update(id, { isVerified })
    
    // Invalidate caches
    await this.invalidateEntityCache(id)
    await this.cacheService.delPattern(`${this.entityName}:email:*`)
    await this.cacheService.delPattern(`${this.entityName}:mobile:*`)
    
    return this.findById(id, { bypassCache: true })
  }

  /**
   * Update user active status
   */
  async updateActiveStatus(id: string, isActive: boolean): Promise<User | null> {
    await this.repository.update(id, { isActive })
    
    // Invalidate caches
    await this.invalidateEntityCache(id)
    await this.invalidateListCaches()
    
    return this.findById(id, { bypassCache: true })
  }

  /**
   * Update user password hash
   */
  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repository.update(id, { passwordHash })
    
    // Invalidate user cache but keep other caches
    await this.invalidateEntityCache(id)
  }

  protected async invalidateEntityCache(id: string | number): Promise<void> {
    await super.invalidateEntityCache(id)

    if (!this.cacheService) {
      return
    }

    await this.cacheService.delPattern(`${this.entityName}:email:*`)
    await this.cacheService.delPattern(`${this.entityName}:mobile:*`)
  }

  /**
   * Count users by role
   */
  async countByRole(role: string): Promise<number> {
    return this.repository.count({ where: { role } })
  }

  /**
   * Get user statistics
   */
  async getStats(): Promise<{
    total: number
    active: number
    verified: number
    byRole: Record<string, number>
  }> {
    const cacheKey = this.buildCacheKey('stats')

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const [total, active, verified] = await Promise.all([
          this.repository.count(),
          this.repository.count({ where: { isActive: true } }),
          this.repository.count({ where: { isVerified: true } }),
        ])

        // Get count by role
        const rolesQuery = await this.repository
          .createQueryBuilder('user')
          .select('user.role', 'role')
          .addSelect('COUNT(*)', 'count')
          .groupBy('user.role')
          .getRawMany()

        const byRole: Record<string, number> = {}
        rolesQuery.forEach((row) => {
          byRole[row.role] = parseInt(row.count, 10)
        })

        return { total, active, verified, byRole }
      },
      300, // 5 minutes TTL for stats
    )
  }

  /**
   * Override to add custom cache invalidation
   */
  protected async invalidateListCaches(): Promise<void> {
    await super.invalidateListCaches()
    
    // Also invalidate role and active caches
    await this.cacheService.delPattern(`${this.entityName}:role:*`)
    await this.cacheService.delPattern(`${this.entityName}:active:*`)
    await this.cacheService.delPattern(`${this.entityName}:stats`)
  }
}
