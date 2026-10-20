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
  summarizeChanges,
  versionContentOf,
  versionContentOfStory
} from './versioning/version-snapshot'

/**
 * Linear version history of a story: snapshot, list, get, rollback, tag. Branches and
 * merges are in StoryVersionBranchService; the snapshot/diff logic is pure, in
 * versioning/version-snapshot. Callers check access to the story first.
 */
@Injectable()
export class StoryVersionService {
  constructor(
    private readonly versionRepository: StoryVersionRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(StoryVersionService.name)
  }

  /** Snapshots the story; returns the latest version instead when nothing changed */
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

    const saved = await this.versionRepository.insertNumbered(version)

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

  /** Newest first, optionally on one branch */
  async getVersionHistory(
    storyId: number,
    branch?: string,
    limit = 50,
    offset = 0
  ): Promise<StoryVersion[]> {
    return this.versionRepository.findByStoryId(storyId, { branch, limit, offset })
  }

  /** 404 when the story has no such version */
  async getVersion(storyId: number, versionNumber: number): Promise<StoryVersion> {
    const version = await this.versionRepository.findVersion(storyId, versionNumber)

    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for story ${storyId}`)
    }

    return version
  }

  /**
   * Records a ROLLBACK version with the content of `target`, on `branch`. Restoring the
   * story itself is the caller's job, done first so that a refused restore records nothing.
   */
  async recordRollback(
    target: StoryVersion,
    userId: string,
    commitMessage: string,
    branch: string
  ): Promise<StoryVersion> {
    const content = versionContentOf(target)
    const snapshot = snapshotOfVersion(content)
    const parentVersion = await this.versionRepository.getLatestVersion(target.storyId, branch)
    const diff = parentVersion ? diffSnapshots(snapshotOfVersion(parentVersion), snapshot) : null

    const rollbackVersion = Object.assign(new StoryVersion(), content, {
      storyId: target.storyId,
      versionType: VersionType.ROLLBACK,
      status: VersionStatus.ACTIVE,
      branchName: branch,
      commitMessage,
      createdBy: userId,
      isRollback: true,
      rolledBackFromVersionId: target.id,
      parentVersionId: parentVersion?.id || null,
      contentHash: contentHash(snapshot),
      ...(diff && { changes: flattenDiff(diff), changesCount: changedFields(diff).length }),
      changeSummary: `Rolled back to version ${target.versionNumber}`
    })

    const saved = await this.versionRepository.insertNumbered(rollbackVersion)
    this.logger.info(
      { storyId: target.storyId, versionId: saved.id, rolledBackTo: target.versionNumber, branch },
      'Story rolled back'
    )
    return saved
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
