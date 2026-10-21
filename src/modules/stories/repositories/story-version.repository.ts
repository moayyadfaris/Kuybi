import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { StoryVersion } from '../entities/story-version.entity'

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

  /**
   * Deletes automatic versions beyond the newest `keep` per story and branch, at most
   * `batch` per call. Kept regardless: pinned or tagged versions, fork points (parent of
   * a version on another branch: merges compare against them) and merge or rollback
   * sources. Versions whose parent is
   * deleted are re-pointed to the nearest kept ancestor, so the chain stays connected.
   * Returns the number deleted.
   */
  async pruneAutoVersions(keep: number, batch: number): Promise<number> {
    return this.transaction(async manager => {
      const doomed: Array<{ id: string; parentVersionId: string | null }> = await manager.query(
        `SELECT "id", "parentVersionId" FROM (
           SELECT v.*, ROW_NUMBER() OVER (
                    PARTITION BY v."storyId", v."branchName" ORDER BY v."versionNumber" DESC
                  ) AS "rank"
             FROM story_versions v
            WHERE v."versionType" = 'AUTO'
         ) ranked
         WHERE "rank" > $1 AND NOT "isPinned" AND "tag" IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM story_versions o
              WHERE o."mergedFromVersionId" = ranked."id"
                 OR o."rolledBackFromVersionId" = ranked."id"
                 OR (o."parentVersionId" = ranked."id" AND o."branchName" <> ranked."branchName"))
         LIMIT $2`,
        [keep, batch]
      )
      if (doomed.length === 0) return 0

      const parentOf = new Map(doomed.map(v => [v.id, v.parentVersionId]))
      const keptAncestor = (id: string): string | null => {
        let current = parentOf.get(id) ?? null
        while (current && parentOf.has(current)) current = parentOf.get(current) ?? null
        return current
      }
      for (const { id } of doomed) {
        await manager.query(
          `UPDATE story_versions SET "parentVersionId" = $1
            WHERE "parentVersionId" = $2 AND NOT ("id" = ANY($3))`,
          [keptAncestor(id), id, [...parentOf.keys()]]
        )
      }
      await manager.query(`DELETE FROM story_versions WHERE "id" = ANY($1)`, [[...parentOf.keys()]])
      return doomed.length
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

    const load = async (): Promise<StoryVersion[]> => {
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

      return versions
    }
    return options?.bypassCache
      ? load()
      : this.cached(cacheKey, load, options?.ttl ?? this.defaultTTL)
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

    const load = async (): Promise<StoryVersion[]> => {
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

      return chain
    }
    return options?.bypassCache ? load() : this.cached(cacheKey, load, options?.ttl ?? 1800)
  }

  /**
   * Get all unique branch names for a story
   */
  async getBranches(
    storyId: number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<string[]> {
    const cacheKey = this.buildCacheKey('branches', storyId)

    const load = async (): Promise<string[]> => {
      const result = await this.repository
        .createQueryBuilder('version')
        .select('DISTINCT version.branchName', 'branchName')
        .where('version.storyId = :storyId', { storyId })
        .getRawMany()

      const branches = result.map(r => r.branchName)

      return branches
    }
    return options?.bypassCache
      ? load()
      : this.cached(cacheKey, load, options?.ttl ?? this.defaultTTL)
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

    const load = async (): Promise<StoryVersion[]> => {
      const versions = await this.repository.find({
        where: { storyId, branchName: branch },
        relations: { author: true },
        order: { versionNumber: 'DESC' }
      })

      return versions
    }
    return options?.bypassCache
      ? load()
      : this.cached(cacheKey, load, options?.ttl ?? this.defaultTTL)
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
