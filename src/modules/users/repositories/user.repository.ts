import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsRelations, LessThan, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { User } from '../entities/user.entity'

/**
 * User Repository
 *
 * Handles all database operations for User entity with caching.
 */
/**
 * Relations loaded with every user lookup. Role permissions are included because
 * AbilityFactory builds CASL abilities from them for the authenticated user.
 */
const USER_RELATIONS: FindOptionsRelations<User> = {
  profileImage: true,
  primaryRole: { rolePermissions: { permission: true } },
  userRoles: { role: { rolePermissions: { permission: true } } }
}

@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected entityName = 'user'
  protected defaultTTL = 900 // 15 minutes for user data

  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Override findById to include profileImage relation
   */
  async findById(
    id: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<User | null> {
    const cacheKey = this.buildCacheKey('id', id)

    if (options?.bypassCache) {
      return this.repository.findOne({
        where: { id },
        relations: USER_RELATIONS
      })
    }

    return this.cached<User | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { id },
          relations: USER_RELATIONS
        })
      },
      options?.ttl ?? this.defaultTTL
    )
  }

  /**
   * Find user by email with caching
   */
  async findByEmail(email: string, bypassCache = false): Promise<User | null> {
    const cacheKey = this.buildCacheKey('email', email.toLowerCase())

    if (bypassCache) {
      return this.repository.findOne({
        where: { email: email.toLowerCase() },
        relations: USER_RELATIONS
      })
    }

    return this.cached<User | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { email: email.toLowerCase() },
          relations: USER_RELATIONS
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Whether an account uses this email (normalised). Cached under the list tag, so
   * any user write (a signup, an email change) clears it.
   */
  isEmailTaken(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim()
    return this.cached(this.buildCacheKey('email-taken', normalized), () =>
      this.repository.exists({ where: { email: normalized } })
    )
  }

  /** Whether an account uses this mobile number (see isEmailTaken) */
  isMobileTaken(mobileNumber: string): Promise<boolean> {
    return this.cached(this.buildCacheKey('mobile-taken', mobileNumber), () =>
      this.repository.exists({ where: { mobileNumber } })
    )
  }

  /**
   * Find user by mobile number with caching
   */
  async findByMobile(mobileNumber: string): Promise<User | null> {
    const cacheKey = this.buildCacheKey('mobile', mobileNumber)

    return this.cached<User | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { mobileNumber } })
      },
      this.defaultTTL
    )
  }

  /**
   * Find users by role with caching
   */
  async findByRole(
    roleName: string,
    options?: { limit?: number; offset?: number }
  ): Promise<User[]> {
    const cacheKey = this.buildCacheKey(
      'role',
      roleName,
      `limit:${options?.limit ?? 50}`,
      `offset:${options?.offset ?? 0}`
    )

    return this.cached<User[]>(
      cacheKey,
      async () => {
        return this.repository
          .createQueryBuilder('user')
          .innerJoinAndSelect('user.primaryRole', 'role')
          .leftJoinAndSelect('user.profileImage', 'profileImage')
          .where('role.name = :roleName', { roleName })
          .take(options?.limit ?? 50)
          .skip(options?.offset ?? 0)
          .orderBy('user.createdAt', 'DESC')
          .getMany()
      },
      this.defaultTTL
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
    const qb = this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.primaryRole', 'primaryRole')
      .leftJoinAndSelect('user.profileImage', 'profileImage')

    if (query.search) {
      qb.where('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`
      })
    }

    if (query.role) {
      qb.andWhere('primaryRole.name = :role', { role: query.role })
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
      `offset:${options?.offset ?? 0}`
    )

    return this.cached<User[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true },
          take: options?.limit ?? 50,
          skip: options?.offset ?? 0,
          order: { createdAt: 'DESC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Update user verification status
   */
  async updateVerification(id: string, isVerified: boolean): Promise<User | null> {
    await this.repository.update(id, { isVerified })

    await this.invalidateEntityCache(id)

    return this.findById(id, { bypassCache: true })
  }

  /**
   * Update user password hash
   */
  /**
   * Load only the password hash for credential checks. Never cached.
   */
  async findPasswordHash(id: string): Promise<string | null> {
    const row = await this.repository
      .createQueryBuilder('user')
      .select('user.id')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne()
    return row?.passwordHash ?? null
  }

  // ---- Account lockout (auth module). Fresh reads only: lock state decides logins. ----

  /**
   * Adds one failed login attempt atomically and returns the new count (null when the
   * user does not exist). Read-and-save lost increments under concurrent logins.
   */
  async incrementFailedLoginAttempts(id: string): Promise<number | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({ failedLoginAttempts: () => '"failedLoginAttempts" + 1' })
      .where('id = :id', { id })
      .returning(['failedLoginAttempts'])
      .execute()
    await this.invalidateCacheByEntityId(id)
    const rows = result.raw as Array<{ failedLoginAttempts: number }>
    return rows[0]?.failedLoginAttempts ?? null
  }

  /**
   * Locks the account unless it is locked already, in one conditional UPDATE: of several
   * concurrent callers exactly one gets true (and sends the unlock job and email)
   */
  async lockIfUnlocked(
    id: string,
    lock: { lockedAt: Date; lockedUntil: Date; lockReason: string }
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({ isLocked: true, ...lock })
      .where('id = :id', { id })
      .andWhere('"isLocked" = false')
      .execute()
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  findLockState(
    id: string
  ): Promise<Pick<
    User,
    'id' | 'isLocked' | 'failedLoginAttempts' | 'lockedAt' | 'lockedUntil' | 'lockReason'
  > | null> {
    return this.repository.findOne({
      where: { id },
      select: {
        id: true,
        isLocked: true,
        failedLoginAttempts: true,
        lockedAt: true,
        lockedUntil: true,
        lockReason: true
      }
    })
  }

  findLocked(limit: number, offset: number): Promise<[User[], number]> {
    return this.repository.findAndCount({
      where: { isLocked: true },
      take: limit,
      skip: offset,
      order: { lockedAt: 'DESC' }
    })
  }

  /** Locked users whose lock period is over */
  findExpiredLocks(): Promise<User[]> {
    return this.repository.find({ where: { isLocked: true, lockedUntil: LessThan(new Date()) } })
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repository.update(id, { passwordHash })

    // The row (also cached by email and mobile: same row tag) and the lists
    await this.invalidateEntityCache(id)
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

    return this.cached(
      cacheKey,
      async () => {
        const [total, active, verified] = await Promise.all([
          this.repository.count(),
          this.repository.count({ where: { isActive: true } }),
          this.repository.count({ where: { isVerified: true } })
        ])

        // Get count by role using primaryRole relation
        const rolesQuery = await this.repository
          .createQueryBuilder('user')
          .innerJoin('user.primaryRole', 'role')
          .select('role.name', 'role')
          .addSelect('COUNT(*)', 'count')
          .groupBy('role.name')
          .getRawMany()

        const byRole: Record<string, number> = {}
        rolesQuery.forEach(row => {
          byRole[row.role] = parseInt(row.count, 10)
        })

        return { total, active, verified, byRole }
      },
      300 // 5 minutes TTL for stats
    )
  }
}
