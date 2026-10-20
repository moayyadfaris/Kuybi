import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThan, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { StoryVersion, VersionStatus } from '../entities/story-version.entity'

/** First key of the advisory lock taken while numbering a story's versions (with the story id) */
const VERSION_NUMBER_LOCK = 0x53_56 // "SV"

@Injectable()
export class StoryVersionRepository extends BaseRepository<StoryVersion> {
  protected entityName = 'storyVersion'
  protected defaultTTL = 3600 // 1 hour cache TTL (versions rarely change)

  constructor(
    @InjectRepository(StoryVersion)
    repository: Repository<StoryVersion>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  // ---- Retention (version-cleanup jobs) ----

  /** Archived, unpinned versions whose expiry has passed */
  findExpiredArchived(now: Date): Promise<StoryVersion[]> {
    return this.repository.find({
      where: { expiresAt: LessThan(now), isPinned: false, status: VersionStatus.ARCHIVED },
      select: { id: true, storyId: true, versionNumber: true, expiresAt: true }
    })
  }

  /** Active, unpinned versions without an explicit expiry, created before the cutoff */
  findActiveCreatedBefore(cutoff: Date): Promise<StoryVersion[]> {
    return this.repository.find({
      where: {
        createdAt: LessThan(cutoff),
        status: VersionStatus.ACTIVE,
        isPinned: false,
        expiresAt: IsNull()
      },
      select: { id: true, storyId: true, versionNumber: true, createdAt: true }
    })
  }

  /**
   * Find all versions for a story
   */
  async findByStoryId(
    storyId: number,
    options?: {
      branch?: string
      limit?: number
      offset?: number
      ttl?: number
      bypassCache?: boolean
    }
  ): Promise<StoryVersion[]> {
    const cacheKey = this.buildCacheKey(
      'byStoryId',
      storyId,
      options?.branch ?? 'all',
      options?.limit ?? 'all',
      options?.offset ?? 0
    )

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<StoryVersion[]>(cacheKey)
      if (cached) return cached
    }

    const queryBuilder = this.repository
      .createQueryBuilder('version')
      .leftJoinAndSelect('version.author', 'user')
      .where('version.storyId = :storyId', { storyId })

    if (options?.branch) {
      queryBuilder.andWhere('version.branchName = :branch', { branch: options.branch })
    }

    queryBuilder.orderBy('version.versionNumber', 'DESC')

    if (options?.limit) {
      queryBuilder.take(options.limit)
    }

    if (options?.offset) {
      queryBuilder.skip(options.offset)
    }

    const versions = await queryBuilder.getMany()

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheSet(cacheKey, versions, options?.ttl ?? this.defaultTTL)
    }

    return versions
  }

  /**
   * Find a specific version by story ID and version number
   */
  async findVersion(
    storyId: number,
    versionNumber: number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion | null> {
    const cacheKey = this.buildCacheKey('version', storyId, versionNumber)

    if (!options?.bypassCache && this.cacheService) {
      return this.cached<StoryVersion | null>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, versionNumber },
            relations: { author: true, parentVersion: true }
          })
        },
        options?.ttl ?? this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { storyId, versionNumber },
      relations: { author: true, parentVersion: true }
    })
  }

  /**
   * Get the latest version for a story on a specific branch
   */
  async getLatestVersion(
    storyId: number,
    branch = 'main',
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion | null> {
    const cacheKey = this.buildCacheKey('latest', storyId, branch)

    if (!options?.bypassCache && this.cacheService) {
      return this.cached<StoryVersion | null>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, branchName: branch },
            relations: { author: true },
            order: { versionNumber: 'DESC' }
          })
        },
        options?.ttl ?? 900, // 15 min TTL (more dynamic)
        // The newest (or tagged) version, not a unique key: a new version can take its place
        { selection: true }
      )
    }

    return this.repository.findOne({
      where: { storyId, branchName: branch },
      relations: { author: true },
      order: { versionNumber: 'DESC' }
    })
  }

  /**
   * Get the version chain (history) for a specific version
   * Walks back through parentVersionId to build the chain
   */
  async getVersionChain(
    versionId: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion[]> {
    const cacheKey = this.buildCacheKey('chain', versionId)

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<StoryVersion[]>(cacheKey)
      if (cached) return cached
    }

    // Build chain by following parentVersionId
    const chain: StoryVersion[] = []
    let currentId: string | null = versionId

    while (currentId) {
      const version = await this.repository.findOne({
        where: { id: currentId },
        relations: { author: true, parentVersion: true }
      })

      if (!version) break

      chain.push(version)
      currentId = version.parentVersionId
    }

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheSet(cacheKey, chain, options?.ttl ?? 1800) // 30 min TTL
    }

    return chain
  }

  /**
   * Get all unique branch names for a story
   */
  async getBranches(
    storyId: number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<string[]> {
    const cacheKey = this.buildCacheKey('branches', storyId)

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<string[]>(cacheKey)
      if (cached) return cached
    }

    const result = await this.repository
      .createQueryBuilder('version')
      .select('DISTINCT version.branchName', 'branchName')
      .where('version.storyId = :storyId', { storyId })
      .getRawMany()

    const branches = result.map(r => r.branchName)

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheSet(cacheKey, branches, options?.ttl ?? this.defaultTTL)
    }

    return branches
  }

  /**
   * Get all versions on a specific branch
   */
  async getBranchVersions(
    storyId: number,
    branch: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion[]> {
    const cacheKey = this.buildCacheKey('branchVersions', storyId, branch)

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<StoryVersion[]>(cacheKey)
      if (cached) return cached
    }

    const versions = await this.repository.find({
      where: { storyId, branchName: branch },
      relations: { author: true },
      order: { versionNumber: 'DESC' }
    })

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheSet(cacheKey, versions, options?.ttl ?? this.defaultTTL)
    }

    return versions
  }

  /**
   * Find a version by tag
   */
  async findByTag(
    storyId: number,
    tag: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion | null> {
    const cacheKey = this.buildCacheKey('tag', storyId, tag)

    if (!options?.bypassCache && this.cacheService) {
      return this.cached<StoryVersion | null>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, tag },
            relations: { author: true }
          })
        },
        options?.ttl ?? this.defaultTTL,
        // The newest (or tagged) version, not a unique key: a new version can take its place
        { selection: true }
      )
    }

    return this.repository.findOne({
      where: { storyId, tag },
      relations: { author: true }
    })
  }

  /**
   * Inserts a version as the story's next number. Numbering and insert run in one
   * transaction under a per-story advisory lock, so concurrent writers of the same story
   * queue up instead of reading the same MAX (UQ_STORY_VERSIONS_STORY_NUMBER backs this).
   */
  async insertNumbered(version: StoryVersion): Promise<StoryVersion> {
    return this.transaction(
      async manager => {
        await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
          VERSION_NUMBER_LOCK,
          version.storyId
        ])
        const [{ max }] = await manager.query(
          'SELECT MAX("versionNumber") AS max FROM story_versions WHERE "storyId" = $1',
          [version.storyId]
        )
        version.versionNumber = (max ?? 0) + 1
        return manager.save(version)
      },
      { touched: [] }
    )
  }
}
