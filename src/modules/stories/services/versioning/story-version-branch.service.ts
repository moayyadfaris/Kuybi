import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

import { VersionDiff } from '../../dto/version/version-comparison.dto'
import { StoryVersion, VersionStatus, VersionType } from '../../entities/story-version.entity'
import { StoryVersionRepository } from '../../repositories/story-version.repository'

import {
  changedFields,
  contentHash,
  detectConflicts,
  diffSnapshots,
  flattenDiff,
  mergeSnapshots,
  snapshotOfVersion,
  versionContentFromSnapshot,
  versionContentOf
} from './version-snapshot'

export interface BranchInfo {
  name: string
  versionCount: number
  latestVersion: number
  lastUpdated: Date
  isMain: boolean
}

/**
 * Git-like branch operations on story versions: branch, merge, compare. Linear history
 * (create, rollback, tag) is in StoryVersionService.
 */
@Injectable()
export class StoryVersionBranchService {
  constructor(
    private readonly versionRepository: StoryVersionRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(StoryVersionBranchService.name)
  }

  /**
   * Create a new branch from a specific version (the latest on main by default)
   */
  async createBranch(
    storyId: number,
    branchName: string,
    fromVersionNumber: number | undefined,
    userId: string,
    commitMessage?: string
  ): Promise<StoryVersion> {
    this.logger.info({ storyId, branchName, fromVersionNumber, userId }, 'Creating new branch')

    const existingBranches = await this.versionRepository.getBranches(storyId)
    if (existingBranches.includes(branchName)) {
      throw new BadRequestException(`Branch '${branchName}' already exists`)
    }

    const sourceVersion = fromVersionNumber
      ? await this.getVersion(storyId, fromVersionNumber)
      : await this.versionRepository.getLatestVersion(storyId, 'main')
    if (!sourceVersion) {
      throw new NotFoundException(`No versions found for story ${storyId}`)
    }

    const branchVersion = Object.assign(new StoryVersion(), versionContentOf(sourceVersion), {
      storyId,
      versionNumber: await this.versionRepository.getNextVersionNumber(storyId),
      versionType: VersionType.BRANCH,
      status: VersionStatus.ACTIVE,
      branchName,
      commitMessage: commitMessage || `Created branch from version ${sourceVersion.versionNumber}`,
      createdBy: userId,
      parentVersionId: sourceVersion.id,
      contentHash: sourceVersion.contentHash,
      changeSummary: `Branched from version ${sourceVersion.versionNumber}`,
      changesCount: 0
    })

    const saved = await this.versionRepository.save(branchVersion)
    this.logger.info({ storyId, branchName, versionId: saved.id }, 'Branch created successfully')
    return saved
  }

  /**
   * Merge a version from one branch into the latest version of another
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

    const sourceVersion = await this.versionRepository.findVersion(storyId, fromVersionNumber)
    if (!sourceVersion || sourceVersion.branchName !== fromBranch) {
      throw new NotFoundException(
        `Version ${fromVersionNumber} not found on branch '${fromBranch}'`
      )
    }

    const targetVersion = await this.versionRepository.getLatestVersion(storyId, targetBranch)
    if (!targetVersion) {
      throw new NotFoundException(`Branch '${targetBranch}' not found`)
    }

    const sourceSnapshot = snapshotOfVersion(sourceVersion)
    const targetSnapshot = snapshotOfVersion(targetVersion)

    const baseVersion = await this.findCommonAncestor(sourceVersion, targetVersion)
    const conflicts = baseVersion
      ? detectConflicts(snapshotOfVersion(baseVersion), sourceSnapshot, targetSnapshot)
      : []
    if (conflicts.length > 0 && !resolveConflicts) {
      throw new ConflictException({
        message: 'Merge conflicts detected. Please provide conflict resolutions.',
        conflicts
      })
    }

    const merged = mergeSnapshots(sourceSnapshot, resolveConflicts)
    const diff = diffSnapshots(targetSnapshot, merged)

    const mergeVersion = Object.assign(new StoryVersion(), versionContentFromSnapshot(merged), {
      storyId,
      versionNumber: await this.versionRepository.getNextVersionNumber(storyId),
      versionType: VersionType.MERGE,
      status: VersionStatus.ACTIVE,
      branchName: targetBranch,
      commitMessage,
      createdBy: userId,
      parentVersionId: targetVersion.id,
      mergedFromVersionId: sourceVersion.id,
      contentHash: contentHash(merged),
      changes: flattenDiff(diff),
      changesCount: changedFields(diff).length,
      changeSummary: `Merged from ${fromBranch} version ${fromVersionNumber}`
    })

    const saved = await this.versionRepository.save(mergeVersion)
    this.logger.info(
      { storyId, mergeVersionId: saved.id, fromBranch, targetBranch },
      'Version merged successfully'
    )
    return saved
  }

  /**
   * Compare two versions field by field
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

    const diff = diffSnapshots(snapshotOfVersion(vA), snapshotOfVersion(vB))
    const fields = changedFields(diff)

    return { versionA: vA, versionB: vB, diff, changesCount: fields.length, changedFields: fields }
  }

  /**
   * Branches of a story, main first
   */
  async getBranchInfo(storyId: number): Promise<BranchInfo[]> {
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

  private async getVersion(storyId: number, versionNumber: number): Promise<StoryVersion> {
    const version = await this.versionRepository.findVersion(storyId, versionNumber)
    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for story ${storyId}`)
    }
    return version
  }

  /**
   * Common ancestor of two versions (first version in B's parent chain that is also in A's)
   */
  private async findCommonAncestor(
    versionA: StoryVersion,
    versionB: StoryVersion
  ): Promise<StoryVersion | null> {
    const chainA = await this.versionRepository.getVersionChain(versionA.id)
    const chainB = await this.versionRepository.getVersionChain(versionB.id)
    const chainAIds = new Set(chainA.map(v => v.id))
    return chainB.find(version => chainAIds.has(version.id)) ?? null
  }
}
