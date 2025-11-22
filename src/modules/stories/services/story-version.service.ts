import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PinoLogger } from 'nestjs-pino'

import { User } from '@modules/users/entities/user.entity'

import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'

import { CreateVersionDto } from '../dto/version/create-version.dto'
import { VersionDiff } from '../dto/version/version-comparison.dto'
import { VersionResponseDto, VersionUserDto } from '../dto/version/version-response.dto'
import { Story, StoryPriority, StoryStatus, StoryType } from '../entities/story.entity'
import { StoryVersion, VersionStatus, VersionType } from '../entities/story-version.entity'

/**
 * Story Version Service
 *
 * Handles version creation, diff calculation, and content hash generation.
 * Provides Git-like version control for stories.
 */
@Injectable()
export class StoryVersionService {
  constructor(
    private readonly versionRepository: StoryVersionRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(StoryVersionService.name)
  }

  /**
   * Create a new version from a story
   */
  async createVersion(story: Story, dto: CreateVersionDto, userId: string): Promise<StoryVersion> {
    this.logger.info(
      { storyId: story.id, versionType: dto.versionType, userId },
      'Creating story version'
    )

    // Get previous version for diff calculation
    const previousVersion = await this.versionRepository.getLatestVersion(
      story.id,
      dto.branchName || 'main'
    )

    // Generate version number
    const versionNumber = await this.versionRepository.getNextVersionNumber(story.id)

    // Create snapshot of current story state
    const snapshot = this.createSnapshot(story)

    // Calculate content hash for deduplication
    const contentHash = this.generateContentHash(snapshot)

    // Check for duplicate content
    if (previousVersion && previousVersion.contentHash === contentHash) {
      this.logger.info(
        { storyId: story.id, contentHash },
        'Skipping version creation - content unchanged'
      )
      return previousVersion
    }

    // Calculate diff from previous version
    let changes: Record<string, unknown> | null = null
    let changeSummary: string | null = null
    let changesCount = 0

    if (previousVersion) {
      const diff = this.calculateDiff(this.extractSnapshotForDiff(previousVersion), snapshot)
      changes = diff.modified ? { ...diff.added, ...diff.modified, ...diff.removed } : null
      changesCount =
        Object.keys(diff.added || {}).length +
        Object.keys(diff.modified || {}).length +
        Object.keys(diff.removed || {}).length
      changeSummary = this.generateChangeSummary(diff)
    } else {
      changeSummary = 'Initial version'
    }

    // Create version entity
    const version = new StoryVersion()
    version.storyId = story.id
    version.versionNumber = versionNumber
    version.versionLabel = dto.versionLabel
    version.versionType = dto.versionType
    version.status = VersionStatus.ARCHIVED
    version.branchName = dto.branchName || 'main'
    version.tag = dto.tag
    version.commitMessage = dto.commitMessage
    version.isPinned = dto.isPinned || false

    // Store complete snapshot
    version.title = story.title
    version.details = story.details
    version.type = story.type
    version.storyStatus = story.status
    version.priority = story.priority
    version.fromTime = story.fromTime
    version.toTime = story.toTime
    version.latitude = story.latitude
    version.longitude = story.longitude
    version.address = story.address
    version.city = story.city
    version.region = story.region
    version.countryId = story.countryId
    version.metadata = story.metadata as Record<string, unknown>
    version.internalNotes = story.internalNotes

    // Store relation IDs
    version.tagIds = story.tags?.map(t => t.id) || null
    version.categoryIds = story.categories?.map(c => c.id) || null
    version.attachmentIds = story.attachments?.map(a => a.id) || null
    version.mainImageId = story.mainImageId

    // Version metadata
    version.parentVersionId = previousVersion?.id || null
    version.changes = changes
    version.changeSummary = changeSummary
    version.changesCount = changesCount
    version.contentHash = contentHash
    version.createdBy = userId

    const saved = await this.versionRepository.save(version)

    this.logger.info(
      {
        storyId: story.id,
        versionId: saved.id,
        versionNumber: saved.versionNumber,
        changesCount
      },
      'Story version created successfully'
    )

    return saved
  }

  /**
   * Get version history for a story
   */
  async getVersionHistory(
    storyId: number,
    branch?: string,
    limit = 50,
    offset = 0
  ): Promise<StoryVersion[]> {
    return this.versionRepository.findByStoryId(storyId, {
      branch,
      limit,
      offset
    })
  }

  /**
   * Get a specific version
   */
  async getVersion(storyId: number, versionNumber: number): Promise<StoryVersion> {
    const version = await this.versionRepository.findVersion(storyId, versionNumber)

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for story ${storyId}`)
    }

    return version
  }

  /**
   * Calculate diff between two version snapshots
   */
  calculateDiff(
    fromSnapshot: Record<string, unknown>,
    toSnapshot: Record<string, unknown>
  ): VersionDiff {
    const added: Record<string, unknown> = {}
    const modified: Record<string, { old: unknown; new: unknown }> = {}
    const removed: Record<string, unknown> = {}

    // Find added and modified fields
    for (const [key, newValue] of Object.entries(toSnapshot)) {
      if (!(key in fromSnapshot)) {
        added[key] = newValue
      } else if (!this.isEqual(fromSnapshot[key], newValue)) {
        modified[key] = {
          old: fromSnapshot[key],
          new: newValue
        }
      }
    }

    // Find removed fields
    for (const [key, oldValue] of Object.entries(fromSnapshot)) {
      if (!(key in toSnapshot)) {
        removed[key] = oldValue
      }
    }

    return { added, modified, removed }
  }

  /**
   * Generate SHA-256 content hash for deduplication
   */
  generateContentHash(snapshot: Record<string, unknown>): string {
    // Sort keys for consistent hashing
    const sortedSnapshot = Object.keys(snapshot)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = snapshot[key]
          return acc
        },
        {} as Record<string, unknown>
      )

    const content = JSON.stringify(sortedSnapshot)
    return createHash('sha256').update(content).digest('hex')
  }

  /**
   * Convert version entity to response DTO
   */
  toResponseDto(version: StoryVersion & { author?: User }): VersionResponseDto {
    return {
      id: version.id,
      storyId: version.storyId,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      versionType: version.versionType,
      status: version.status,
      branchName: version.branchName,
      tag: version.tag,
      changesCount: version.changesCount,
      changeSummary: version.changeSummary,
      createdBy: this.mapUserToDto(version.author),
      createdAt: version.createdAt,
      commitMessage: version.commitMessage,
      isPinned: version.isPinned,
      expiresAt: version.expiresAt
    }
  }

  /**
   * Create snapshot from story entity
   */
  private createSnapshot(story: Story): Record<string, unknown> {
    return {
      title: story.title,
      details: story.details,
      type: story.type,
      status: story.status,
      priority: story.priority,
      fromTime: story.fromTime?.toISOString(),
      toTime: story.toTime?.toISOString(),
      latitude: story.latitude,
      longitude: story.longitude,
      address: story.address,
      city: story.city,
      region: story.region,
      countryId: story.countryId,
      metadata: story.metadata,
      internalNotes: story.internalNotes,
      tagIds: story.tags?.map(t => t.id) || [],
      categoryIds: story.categories?.map(c => c.id) || [],
      attachmentIds: story.attachments?.map(a => a.id) || [],
      mainImageId: story.mainImageId
    }
  }

  /**
   * Extract snapshot data from version for diff comparison
   */
  private extractSnapshotForDiff(version: StoryVersion): Record<string, unknown> {
    return {
      title: version.title,
      details: version.details,
      type: version.type,
      status: version.storyStatus,
      priority: version.priority,
      fromTime: version.fromTime?.toISOString(),
      toTime: version.toTime?.toISOString(),
      latitude: version.latitude,
      longitude: version.longitude,
      address: version.address,
      city: version.city,
      region: version.region,
      countryId: version.countryId,
      metadata: version.metadata,
      internalNotes: version.internalNotes,
      tagIds: version.tagIds || [],
      categoryIds: version.categoryIds || [],
      attachmentIds: version.attachmentIds || [],
      mainImageId: version.mainImageId
    }
  }

  /**
   * Generate human-readable change summary
   */
  private generateChangeSummary(diff: VersionDiff): string {
    const changes: string[] = []

    const addedCount = Object.keys(diff.added || {}).length
    const modifiedCount = Object.keys(diff.modified || {}).length
    const removedCount = Object.keys(diff.removed || {}).length

    if (addedCount > 0) {
      changes.push(`${addedCount} field(s) added`)
    }
    if (modifiedCount > 0) {
      const modifiedFields = Object.keys(diff.modified || {})
      if (modifiedFields.length <= 3) {
        changes.push(`Modified: ${modifiedFields.join(', ')}`)
      } else {
        changes.push(`${modifiedCount} field(s) modified`)
      }
    }
    if (removedCount > 0) {
      changes.push(`${removedCount} field(s) removed`)
    }

    return changes.join('; ') || 'No changes'
  }

  /**
   * Deep equality check for values
   */
  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== typeof b) return false

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((item, index) => this.isEqual(item, b[index]))
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object)
      const bKeys = Object.keys(b as object)
      if (aKeys.length !== bKeys.length) return false
      return aKeys.every(key =>
        this.isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      )
    }

    return false
  }

  /**
   * Map user entity to DTO
   */
  private mapUserToDto(user?: User): VersionUserDto {
    if (!user) {
      return {
        id: 'unknown',
        email: 'unknown@kuybi.dev',
        firstName: 'Unknown',
        lastName: 'User'
      }
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.name.split(' ')[0] || '',
      lastName: user.name.split(' ').slice(1).join(' ') || ''
    }
  }

  // ==================== GIT OPERATIONS ====================

  /**
   * Rollback story to a previous version
   * Creates a new version with ROLLBACK type
   */
  async rollbackToVersion(
    storyId: number,
    versionNumber: number,
    userId: string,
    commitMessage: string,
    createBranch = false,
    branchName?: string
  ): Promise<{ version: StoryVersion; restoredContent: Partial<Story> }> {
    this.logger.info(
      { storyId, versionNumber, userId, createBranch },
      'Rolling back story to previous version'
    )

    // Get the target version to rollback to
    const targetVersion = await this.getVersion(storyId, versionNumber)

    // Prepare restored content from target version
    const restoredContent: Partial<Story> = {
      title: targetVersion.title,
      details: targetVersion.details,
      type: targetVersion.type as StoryType,
      status: targetVersion.storyStatus as StoryStatus,
      priority: targetVersion.priority as StoryPriority,
      fromTime: targetVersion.fromTime,
      toTime: targetVersion.toTime,
      latitude: targetVersion.latitude,
      longitude: targetVersion.longitude,
      address: targetVersion.address,
      city: targetVersion.city,
      region: targetVersion.region,
      countryId: targetVersion.countryId,
      metadata: targetVersion.metadata as Record<string, unknown>,
      internalNotes: targetVersion.internalNotes,
      mainImageId: targetVersion.mainImageId
    }

    // Create rollback version
    const rollbackVersion = new StoryVersion()
    rollbackVersion.storyId = storyId
    rollbackVersion.versionNumber = await this.versionRepository.getNextVersionNumber(storyId)
    rollbackVersion.versionType = VersionType.ROLLBACK
    rollbackVersion.status = VersionStatus.ACTIVE
    rollbackVersion.branchName = createBranch
      ? branchName || `rollback-to-v${versionNumber}`
      : 'main'
    rollbackVersion.commitMessage = commitMessage
    rollbackVersion.createdBy = userId
    rollbackVersion.isRollback = true
    rollbackVersion.rolledBackFromVersionId = targetVersion.id

    // Copy content from target version
    Object.assign(rollbackVersion, {
      title: targetVersion.title,
      details: targetVersion.details,
      type: targetVersion.type,
      storyStatus: targetVersion.storyStatus,
      priority: targetVersion.priority,
      fromTime: targetVersion.fromTime,
      toTime: targetVersion.toTime,
      latitude: targetVersion.latitude,
      longitude: targetVersion.longitude,
      address: targetVersion.address,
      city: targetVersion.city,
      region: targetVersion.region,
      countryId: targetVersion.countryId,
      metadata: targetVersion.metadata,
      internalNotes: targetVersion.internalNotes,
      tagIds: targetVersion.tagIds,
      categoryIds: targetVersion.categoryIds,
      attachmentIds: targetVersion.attachmentIds,
      mainImageId: targetVersion.mainImageId
    })

    // Calculate content hash
    const snapshot = this.extractSnapshotForDiff(rollbackVersion)
    rollbackVersion.contentHash = this.generateContentHash(snapshot)

    // Get parent version (latest on branch)
    const parentVersion = await this.versionRepository.getLatestVersion(
      storyId,
      rollbackVersion.branchName
    )
    rollbackVersion.parentVersionId = parentVersion?.id || null

    // Calculate diff from parent
    if (parentVersion) {
      const diff = this.calculateDiff(this.extractSnapshotForDiff(parentVersion), snapshot)
      rollbackVersion.changes = {
        ...diff.added,
        ...diff.modified,
        ...diff.removed
      } as Record<string, unknown>
      rollbackVersion.changesCount =
        Object.keys(diff.added || {}).length +
        Object.keys(diff.modified || {}).length +
        Object.keys(diff.removed || {}).length
      rollbackVersion.changeSummary = `Rolled back to version ${versionNumber}`
    } else {
      rollbackVersion.changeSummary = `Rolled back to version ${versionNumber}`
    }

    const saved = await this.versionRepository.save(rollbackVersion)

    this.logger.info(
      { storyId, newVersionId: saved.id, rolledBackTo: versionNumber },
      'Story rolled back successfully'
    )

    return { version: saved, restoredContent }
  }

  /**
   * Create a new branch from a specific version
   */
  async createBranch(
    storyId: number,
    branchName: string,
    fromVersionNumber: number | undefined,
    userId: string,
    commitMessage?: string
  ): Promise<StoryVersion> {
    this.logger.info({ storyId, branchName, fromVersionNumber, userId }, 'Creating new branch')

    // Validate branch name doesn't exist
    const existingBranches = await this.versionRepository.getBranches(storyId)
    if (existingBranches.includes(branchName)) {
      throw new BadRequestException(`Branch '${branchName}' already exists`)
    }

    // Get source version (latest if not specified)
    let sourceVersion: StoryVersion
    if (fromVersionNumber) {
      sourceVersion = await this.getVersion(storyId, fromVersionNumber)
    } else {
      const latest = await this.versionRepository.getLatestVersion(storyId, 'main')
      if (!latest) {
        throw new NotFoundException(`No versions found for story ${storyId}`)
      }
      sourceVersion = latest
    }

    // Create branch version
    const branchVersion = new StoryVersion()
    branchVersion.storyId = storyId
    branchVersion.versionNumber = await this.versionRepository.getNextVersionNumber(storyId)
    branchVersion.versionType = VersionType.BRANCH
    branchVersion.status = VersionStatus.ACTIVE
    branchVersion.branchName = branchName
    branchVersion.commitMessage =
      commitMessage || `Created branch from version ${sourceVersion.versionNumber}`
    branchVersion.createdBy = userId
    branchVersion.parentVersionId = sourceVersion.id

    // Copy content from source version
    Object.assign(branchVersion, {
      title: sourceVersion.title,
      details: sourceVersion.details,
      type: sourceVersion.type,
      storyStatus: sourceVersion.storyStatus,
      priority: sourceVersion.priority,
      fromTime: sourceVersion.fromTime,
      toTime: sourceVersion.toTime,
      latitude: sourceVersion.latitude,
      longitude: sourceVersion.longitude,
      address: sourceVersion.address,
      city: sourceVersion.city,
      region: sourceVersion.region,
      countryId: sourceVersion.countryId,
      metadata: sourceVersion.metadata,
      internalNotes: sourceVersion.internalNotes,
      tagIds: sourceVersion.tagIds,
      categoryIds: sourceVersion.categoryIds,
      attachmentIds: sourceVersion.attachmentIds,
      mainImageId: sourceVersion.mainImageId,
      contentHash: sourceVersion.contentHash
    })

    branchVersion.changeSummary = `Branched from version ${sourceVersion.versionNumber}`
    branchVersion.changesCount = 0

    const saved = await this.versionRepository.save(branchVersion)

    this.logger.info({ storyId, branchName, versionId: saved.id }, 'Branch created successfully')

    return saved
  }

  /**
   * Merge version from one branch to another
   */
  async mergeVersion(
    storyId: number,
    fromBranch: string,
    fromVersionNumber: number,
    targetBranch: string,
    userId: string,
    commitMessage: string,
    resolveConflicts?: Record<string, unknown>
  ): Promise<StoryVersion> {
    this.logger.info(
      { storyId, fromBranch, fromVersionNumber, targetBranch, userId },
      'Merging version'
    )

    // Get source version
    const sourceVersion = await this.versionRepository.findVersion(storyId, fromVersionNumber)
    if (!sourceVersion || sourceVersion.branchName !== fromBranch) {
      throw new NotFoundException(
        `Version ${fromVersionNumber} not found on branch '${fromBranch}'`
      )
    }

    // Get target branch latest version
    const targetVersion = await this.versionRepository.getLatestVersion(storyId, targetBranch)
    if (!targetVersion) {
      throw new NotFoundException(`Branch '${targetBranch}' not found`)
    }

    // Find common ancestor (simplified - just use parent chain)
    const baseVersion = await this.findCommonAncestor(sourceVersion, targetVersion)

    // Detect conflicts
    const conflicts = baseVersion
      ? await this.detectConflicts(baseVersion, sourceVersion, targetVersion)
      : []

    if (conflicts.length > 0 && !resolveConflicts) {
      throw new BadRequestException({
        message: 'Merge conflicts detected. Please provide conflict resolutions.',
        conflicts
      })
    }

    // Create merge version
    const mergeVersion = new StoryVersion()
    mergeVersion.storyId = storyId
    mergeVersion.versionNumber = await this.versionRepository.getNextVersionNumber(storyId)
    mergeVersion.versionType = VersionType.MERGE
    mergeVersion.status = VersionStatus.ACTIVE
    mergeVersion.branchName = targetBranch
    mergeVersion.commitMessage = commitMessage
    mergeVersion.createdBy = userId
    mergeVersion.parentVersionId = targetVersion.id
    mergeVersion.mergedFromVersionId = sourceVersion.id

    // Merge content (prefer source, apply conflict resolutions)
    const mergedContent = this.mergeContent(
      sourceVersion,
      targetVersion,
      conflicts,
      resolveConflicts
    )

    Object.assign(mergeVersion, mergedContent)

    // Calculate content hash
    const snapshot = this.extractSnapshotForDiff(mergeVersion)
    mergeVersion.contentHash = this.generateContentHash(snapshot)

    // Calculate diff from target
    const diff = this.calculateDiff(this.extractSnapshotForDiff(targetVersion), snapshot)
    mergeVersion.changes = {
      ...diff.added,
      ...diff.modified,
      ...diff.removed
    } as Record<string, unknown>
    mergeVersion.changesCount =
      Object.keys(diff.added || {}).length +
      Object.keys(diff.modified || {}).length +
      Object.keys(diff.removed || {}).length
    mergeVersion.changeSummary = `Merged from ${fromBranch} version ${fromVersionNumber}`

    const saved = await this.versionRepository.save(mergeVersion)

    this.logger.info(
      { storyId, mergeVersionId: saved.id, fromBranch, targetBranch },
      'Version merged successfully'
    )

    return saved
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    storyId: number,
    versionA: number,
    versionB: number
  ): Promise<{
    versionA: StoryVersion
    versionB: StoryVersion
    diff: VersionDiff
    changesCount: number
    changedFields: string[]
  }> {
    const [vA, vB] = await Promise.all([
      this.getVersion(storyId, versionA),
      this.getVersion(storyId, versionB)
    ])

    const snapshotA = this.extractSnapshotForDiff(vA)
    const snapshotB = this.extractSnapshotForDiff(vB)

    const diff = this.calculateDiff(snapshotA, snapshotB)

    const changedFields = [
      ...Object.keys(diff.added || {}),
      ...Object.keys(diff.modified || {}),
      ...Object.keys(diff.removed || {})
    ]

    const changesCount = changedFields.length

    return {
      versionA: vA,
      versionB: vB,
      diff,
      changesCount,
      changedFields
    }
  }

  /**
   * Tag a specific version
   */
  async tagVersion(storyId: number, versionNumber: number, tag: string): Promise<StoryVersion> {
    this.logger.info({ storyId, versionNumber, tag }, 'Tagging version')

    const version = await this.getVersion(storyId, versionNumber)

    // Check if tag already exists
    const existingTag = await this.versionRepository.findByTag(storyId, tag)
    if (existingTag && existingTag.id !== version.id) {
      throw new BadRequestException(
        `Tag '${tag}' already exists on version ${existingTag.versionNumber}`
      )
    }

    version.tag = tag
    const updated = await this.versionRepository.update(version.id, { tag })

    this.logger.info({ storyId, versionId: version.id, tag }, 'Version tagged successfully')

    return updated
  }

  /**
   * Get branch information
   */
  async getBranchInfo(storyId: number): Promise<
    Array<{
      name: string
      versionCount: number
      latestVersion: number
      lastUpdated: Date
      isMain: boolean
    }>
  > {
    const branches = await this.versionRepository.getBranches(storyId)

    const branchInfo = await Promise.all(
      branches.map(async branch => {
        const versions = await this.versionRepository.getBranchVersions(storyId, branch)
        const latest = versions[0] // Already sorted DESC

        return {
          name: branch,
          versionCount: versions.length,
          latestVersion: latest?.versionNumber || 0,
          lastUpdated: latest?.createdAt || new Date(),
          isMain: branch === 'main'
        }
      })
    )

    return branchInfo.sort((a, b) => (a.isMain ? -1 : b.isMain ? 1 : 0))
  }

  // ==================== HELPER METHODS ====================

  /**
   * Find common ancestor of two versions (simplified LCA)
   */
  private async findCommonAncestor(
    versionA: StoryVersion,
    versionB: StoryVersion
  ): Promise<StoryVersion | null> {
    // Get version chains
    const chainA = await this.versionRepository.getVersionChain(versionA.id)
    const chainB = await this.versionRepository.getVersionChain(versionB.id)

    // Build set of version IDs in chain A
    const chainAIds = new Set(chainA.map(v => v.id))

    // Find first version in chain B that exists in chain A
    for (const version of chainB) {
      if (chainAIds.has(version.id)) {
        return version
      }
    }

    return null
  }

  /**
   * Detect conflicts between versions
   */
  private async detectConflicts(
    baseVersion: StoryVersion,
    sourceVersion: StoryVersion,
    targetVersion: StoryVersion
  ): Promise<
    Array<{
      field: string
      baseValue: unknown
      sourceValue: unknown
      targetValue: unknown
    }>
  > {
    const baseSnapshot = this.extractSnapshotForDiff(baseVersion)
    const sourceSnapshot = this.extractSnapshotForDiff(sourceVersion)
    const targetSnapshot = this.extractSnapshotForDiff(targetVersion)

    const conflicts: Array<{
      field: string
      baseValue: unknown
      sourceValue: unknown
      targetValue: unknown
    }> = []

    // Check each field for conflicts
    const allFields = new Set([
      ...Object.keys(baseSnapshot),
      ...Object.keys(sourceSnapshot),
      ...Object.keys(targetSnapshot)
    ])

    for (const field of allFields) {
      const baseValue = baseSnapshot[field]
      const sourceValue = sourceSnapshot[field]
      const targetValue = targetSnapshot[field]

      // Conflict if both source and target changed from base, but differently
      const sourceChanged = !this.isEqual(baseValue, sourceValue)
      const targetChanged = !this.isEqual(baseValue, targetValue)
      const differentChanges = !this.isEqual(sourceValue, targetValue)

      if (sourceChanged && targetChanged && differentChanges) {
        conflicts.push({
          field,
          baseValue,
          sourceValue,
          targetValue
        })
      }
    }

    return conflicts
  }

  /**
   * Merge content from two versions with conflict resolution
   */
  private mergeContent(
    sourceVersion: StoryVersion,
    targetVersion: StoryVersion,
    conflicts: Array<{ field: string; sourceValue: unknown; targetValue: unknown }>,
    resolveConflicts?: Record<string, unknown>
  ): Partial<StoryVersion> {
    const merged: Record<string, unknown> = {}

    // Copy all source content
    const sourceSnapshot = this.extractSnapshotForDiff(sourceVersion)

    for (const [key, value] of Object.entries(sourceSnapshot)) {
      merged[key] = value
    }

    // Apply conflict resolutions if provided
    if (resolveConflicts) {
      for (const [field, resolution] of Object.entries(resolveConflicts)) {
        merged[field] = resolution
      }
    }

    return merged
  }
}
