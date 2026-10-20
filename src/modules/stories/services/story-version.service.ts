import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

import { CreateVersionDto } from '../dto/version/create-version.dto'
import { Story } from '../entities/story.entity'
import { StoryVersion, VersionStatus, VersionType } from '../entities/story-version.entity'
import { StoryVersionRepository } from '../repositories/story-version.repository'

import {
  changedFields,
  contentHash,
  diffSnapshots,
  flattenDiff,
  snapshotOfStory,
  snapshotOfVersion,
  storyContentOfVersion,
  summarizeChanges,
  versionContentOf,
  versionContentOfStory
} from './versioning/version-snapshot'

/**
 * Story Version Service
 *
 * Linear version history of a story: snapshot, list, get, rollback, tag. Branches and
 * merges are in StoryVersionBranchService; the snapshot/diff logic is pure, in
 * versioning/version-snapshot.
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
   * Create a new version from a story (skipped when the content is unchanged)
   */
  async createVersion(story: Story, dto: CreateVersionDto, userId: string): Promise<StoryVersion> {
    this.logger.info(
      { storyId: story.id, versionType: dto.versionType, userId },
      'Creating story version'
    )

    const branchName = dto.branchName || 'main'
    const previousVersion = await this.versionRepository.getLatestVersion(story.id, branchName)
    const snapshot = snapshotOfStory(story)
    const hash = contentHash(snapshot)

    if (previousVersion && previousVersion.contentHash === hash) {
      this.logger.info(
        { storyId: story.id, contentHash: hash },
        'Skipping version creation - content unchanged'
      )
      return previousVersion
    }

    const diff = previousVersion
      ? diffSnapshots(snapshotOfVersion(previousVersion), snapshot)
      : null

    const version = Object.assign(new StoryVersion(), versionContentOfStory(story), {
      storyId: story.id,
      versionNumber: await this.versionRepository.getNextVersionNumber(story.id),
      versionLabel: dto.versionLabel ?? null,
      versionType: dto.versionType,
      status: VersionStatus.ARCHIVED,
      branchName,
      tag: dto.tag ?? null,
      commitMessage: dto.commitMessage ?? null,
      isPinned: dto.isPinned || false,
      parentVersionId: previousVersion?.id || null,
      changes: diff ? flattenDiff(diff) : null,
      changeSummary: diff ? summarizeChanges(diff) : 'Initial version',
      changesCount: diff ? changedFields(diff).length : 0,
      contentHash: hash,
      createdBy: userId
    })

    const saved = await this.versionRepository.save(version)

    this.logger.info(
      {
        storyId: story.id,
        versionId: saved.id,
        versionNumber: saved.versionNumber,
        changesCount: saved.changesCount
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
    return this.versionRepository.findByStoryId(storyId, { branch, limit, offset })
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
   * Rollback a story to a previous version: records a ROLLBACK version (on main, or on
   * a new branch) and returns the story content to restore, which the caller applies.
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

    const targetVersion = await this.getVersion(storyId, versionNumber)
    const rollbackBranch = createBranch ? branchName || `rollback-to-v${versionNumber}` : 'main'

    const content = versionContentOf(targetVersion)
    const snapshot = snapshotOfVersion(content)
    const parentVersion = await this.versionRepository.getLatestVersion(storyId, rollbackBranch)
    const diff = parentVersion ? diffSnapshots(snapshotOfVersion(parentVersion), snapshot) : null

    const rollbackVersion = Object.assign(new StoryVersion(), content, {
      storyId,
      versionNumber: await this.versionRepository.getNextVersionNumber(storyId),
      versionType: VersionType.ROLLBACK,
      status: VersionStatus.ACTIVE,
      branchName: rollbackBranch,
      commitMessage,
      createdBy: userId,
      isRollback: true,
      rolledBackFromVersionId: targetVersion.id,
      parentVersionId: parentVersion?.id || null,
      contentHash: contentHash(snapshot),
      ...(diff && { changes: flattenDiff(diff), changesCount: changedFields(diff).length }),
      changeSummary: `Rolled back to version ${versionNumber}`
    })

    const saved = await this.versionRepository.save(rollbackVersion)

    this.logger.info(
      { storyId, newVersionId: saved.id, rolledBackTo: versionNumber },
      'Story rolled back successfully'
    )

    return { version: saved, restoredContent: storyContentOfVersion(targetVersion) }
  }

  /**
   * Tag a specific version (a tag names one version per story)
   */
  async tagVersion(storyId: number, versionNumber: number, tag: string): Promise<StoryVersion> {
    this.logger.info({ storyId, versionNumber, tag }, 'Tagging version')

    const version = await this.getVersion(storyId, versionNumber)

    const existingTag = await this.versionRepository.findByTag(storyId, tag)
    if (existingTag && existingTag.id !== version.id) {
      throw new BadRequestException(
        `Tag '${tag}' already exists on version ${existingTag.versionNumber}`
      )
    }

    const updated = await this.versionRepository.update(version.id, { tag })
    if (!updated) {
      // Deleted since it was read above
      throw new NotFoundException(`Version ${versionNumber} not found`)
    }

    this.logger.info({ storyId, versionId: version.id, tag }, 'Version tagged successfully')

    return updated
  }
}
