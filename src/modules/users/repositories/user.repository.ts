import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsRelations, LessThan, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { User } from '../entities/user.entity'

/**
 * Relations loaded with every user lookup. Role permissions are included because
 * AbilityFactory builds CASL abilities from them for the authenticated user.
 */
const USER_RELATIONS: FindOptionsRelations<User> = {
  profileImage: true,
  primaryRole: { rolePermissions: { permission: true } },
  userRoles: { role: { rolePermissions: { permission: true } } }
}

/**
 * Users table. Rows are cached with their roles and permissions embedded; changing a
 * user's roles (UserRolesService) invalidates the user's cached row. Authentication
 * reads users fresh (JwtStrategy), so cached permissions never decide access.
 */
/** lockReason of a lock placed by failed logins (AccountLockoutService); it expires */
const FAILED_ATTEMPTS_LOCK = 'FAILED_ATTEMPTS'

@Injectable()
export class UserRepository extends BaseRepository<User> {
  protected entityName = 'user'
  protected defaultTTL = 900

  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** With profile image, roles and permissions (USER_RELATIONS) */
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

  /** By email (stored lowercased); with the same relations as findById */
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

  /** By mobile number, without relations */
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

  /** Users whose primary role is `roleName`, newest first */
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

  /** Users matching name or email (case-insensitive substring) and the filters */
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

  /** Only the password hash, for credential checks. Never cached. */
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

  /** Users whose failed-login lock is over (an admin's lock has no end) */
  findExpiredLocks(): Promise<User[]> {
    return this.repository.find({
      where: {
        isLocked: true,
        lockReason: FAILED_ATTEMPTS_LOCK,
        lockedUntil: LessThan(new Date())
      }
    })
  }

  /**
   * Lifts a failed-login lock whose time is up, in one conditional UPDATE: never an
   * admin's lock, nor a newer lock than the one an unlock job was scheduled for.
   */
  async unlockIfExpired(id: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({
        isLocked: false,
        failedLoginAttempts: 0,
        lockedAt: null,
        lockedUntil: null,
        lockReason: null
      })
      .where('id = :id', { id })
      .andWhere('"isLocked" = true')
      .andWhere('"lockReason" = :reason', { reason: FAILED_ATTEMPTS_LOCK })
      .andWhere('"lockedUntil" <= now()')
      .execute()
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  /**
   * Forgets failed logins, unless there were more since `expected` was read or the
   * account is locked
   */
  async resetFailedAttemptsIf(id: string, expected: number): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({ failedLoginAttempts: 0 })
      .where('id = :id', { id })
      .andWhere('"failedLoginAttempts" = :expected', { expected })
      .andWhere('"isLocked" = false')
      .execute()
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repository.update(id, { passwordHash })

    // The row (also cached by email and mobile: same row tag) and the lists
    await this.invalidateEntityCache(id)
  }

  /** Totals, and users per primary role */
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
      300
    )
  }
}
