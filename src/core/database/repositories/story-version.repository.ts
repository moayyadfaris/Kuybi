import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm'

import { StoryVersion } from '@modules/stories/entities/story-version.entity'

import { CacheService } from '../../cache/services/cache.service'

import { BaseRepository } from './base.repository'

/**
 * Story Version Repository
 *
 * Handles all database operations for StoryVersion entity with caching.
 * Provides specialized queries for version chains, branches, and tags.
 */
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
      await this.cacheService.set(cacheKey, versions, options?.ttl ?? this.defaultTTL)
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
      return this.cacheService.wrap<StoryVersion>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, versionNumber },
            relations: ['author', 'parentVersion']
          })
        },
        options?.ttl ?? this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { storyId, versionNumber },
      relations: ['author', 'parentVersion']
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
      return this.cacheService.wrap<StoryVersion>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, branchName: branch },
            relations: ['author'],
            order: { versionNumber: 'DESC' }
          })
        },
        options?.ttl ?? 900 // 15 min TTL (more dynamic)
      )
    }

    return this.repository.findOne({
      where: { storyId, branchName: branch },
      relations: ['author'],
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
        relations: ['author', 'parentVersion']
      })

      if (!version) break

      chain.push(version)
      currentId = version.parentVersionId
    }

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, chain, options?.ttl ?? 1800) // 30 min TTL
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
      await this.cacheService.set(cacheKey, branches, options?.ttl ?? this.defaultTTL)
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
      relations: ['author'],
      order: { versionNumber: 'DESC' }
    })

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, versions, options?.ttl ?? this.defaultTTL)
    }

    return versions
  }

  /**
   * Get all tagged versions for a story
   */
  async getTaggedVersions(
    storyId: number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion[]> {
    const cacheKey = this.buildCacheKey('tagged', storyId)

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<StoryVersion[]>(cacheKey)
      if (cached) return cached
    }

    const versions = await this.repository.find({
      where: { storyId, tag: Not(IsNull()) } as unknown as FindOptionsWhere<StoryVersion>,
      relations: ['author'],
      order: { createdAt: 'DESC' }
    })

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, versions, options?.ttl ?? this.defaultTTL)
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
      return this.cacheService.wrap<StoryVersion>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { storyId, tag },
            relations: ['author']
          })
        },
        options?.ttl ?? this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { storyId, tag },
      relations: ['author']
    })
  }

  /**
   * Find versions with the same content hash (duplicates)
   */
  async findByContentHash(
    contentHash: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<StoryVersion[]> {
    const cacheKey = this.buildCacheKey('contentHash', contentHash)

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<StoryVersion[]>(cacheKey)
      if (cached) return cached
    }

    const versions = await this.repository.find({
      where: { contentHash },
      relations: ['author'],
      order: { createdAt: 'DESC' }
    })

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, versions, options?.ttl ?? this.defaultTTL)
    }

    return versions
  }

  /**
   * Get the next version number for a story
   */
  async getNextVersionNumber(storyId: number): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('version')
      .select('MAX(version.versionNumber)', 'maxVersion')
      .where('version.storyId = :storyId', { storyId })
      .getRawOne()

    return (result?.maxVersion ?? 0) + 1
  }

  /**
   * Count versions for a story
   */
  async countVersions(
    storyId: number,
    branch?: string,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<number> {
    const cacheKey = this.buildCacheKey('count', storyId, branch ?? 'all')

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<number>(cacheKey)
      if (cached !== null && cached !== undefined) return cached
    }

    const where: FindOptionsWhere<StoryVersion> = { storyId }
    if (branch) {
      where.branchName = branch
    }

    const count = await this.repository.count({ where })

    if (this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, count, options?.ttl ?? 900) // 15 min TTL
    }

    return count
  }

  /**
   * Invalidate all caches for a specific story
   */
  async invalidateStoryVersionCaches(storyId: number): Promise<void> {
    if (!this.cacheService) return

    const pattern = this.buildCacheKey('*', storyId, '*')
    await this.cacheService.delPattern(pattern)

    // Also invalidate list caches
    await this.invalidateListCaches()
  }

  /**
   * Override save to invalidate caches
   */
  async save(entity: StoryVersion): Promise<StoryVersion> {
    const saved = await this.repository.save(entity)

    // Invalidate all version caches for this story
    await this.invalidateStoryVersionCaches(saved.storyId)

    return saved
  }

  /**
   * Override update to invalidate caches
   */
  async update(id: string, data: Partial<StoryVersion>): Promise<StoryVersion> {
    const version = await this.repository.findOne({ where: { id } })
    if (!version) {
      throw new Error(`StoryVersion with id ${id} not found`)
    }

    Object.assign(version, data)
    return this.save(version)
  }

  /**
   * Override delete to invalidate caches
   */
  async delete(id: string): Promise<boolean> {
    const version = await this.repository.findOne({ where: { id } })
    if (version) {
      await this.repository.delete(id)
      await this.invalidateStoryVersionCaches(version.storyId)
      return true
    }
    return false
  }
}
