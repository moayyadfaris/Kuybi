import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { User } from '../../users/entities/user.entity'

import { Story } from './story.entity'

export enum VersionType {
  MANUAL = 'MANUAL', // User manually created version
  AUTO = 'AUTO', // Auto-saved on update
  BRANCH = 'BRANCH', // Branch point
  MERGE = 'MERGE', // Merge commit
  ROLLBACK = 'ROLLBACK' // Created from rollback
}

export enum VersionStatus {
  ACTIVE = 'ACTIVE', // Current active version
  ARCHIVED = 'ARCHIVED', // Old version
  DRAFT = 'DRAFT', // Work in progress
  DELETED = 'DELETED' // Soft deleted version
}

/**
 * StoryVersion Entity
 *
 * Stores complete snapshots of story content at different points in time.
 * Provides Git-like version control with branching, merging, and rollback.
 *
 * Features:
 * - Complete content snapshots
 * - Parent version tracking for history chain
 * - Branch/tag support
 * - Diff calculation
 * - Rollback capabilities
 * - Change summary
 */
@Entity('story_versions')
@Index(['storyId', 'versionNumber'])
@Index(['storyId', 'createdAt'])
@Index(['branchName'])
@Index(['tag'])
@Index(['createdBy'])
export class StoryVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Story reference
  @Column({ type: 'int' })
  storyId: number

  @ManyToOne(() => Story, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storyId' })
  story: Story

  // Version metadata
  @Column({ type: 'int' })
  versionNumber: number // Sequential version number (1, 2, 3, ...)

  @Column({ type: 'varchar', length: 100, nullable: true })
  versionLabel: string | null // e.g., "v1.0", "beta-1"

  @Column({
    type: 'enum',
    enum: VersionType,
    default: VersionType.AUTO
  })
  versionType: VersionType

  @Column({
    type: 'enum',
    enum: VersionStatus,
    default: VersionStatus.ARCHIVED
  })
  status: VersionStatus

  // Complete content snapshot
  @Column({ type: 'varchar', length: 200 })
  title: string

  @Column({ type: 'text', nullable: true })
  details: string | null

  @Column({ type: 'varchar', length: 50 })
  type: string // StoryType as string

  @Column({ type: 'varchar', length: 50 })
  storyStatus: string // StoryStatus as string

  @Column({ type: 'varchar', length: 50 })
  priority: string // StoryPriority as string

  @Column({ type: 'timestamptz', nullable: true })
  fromTime: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  toTime: Date | null

  // Location data
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number | null

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null

  @Column({ type: 'int', nullable: true })
  countryId: number | null

  // Metadata snapshot
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>

  @Column({ type: 'text', nullable: true })
  internalNotes: string | null

  // Relations snapshots (IDs only)
  @Column({ type: 'jsonb', nullable: true })
  tagIds: number[] | null

  @Column({ type: 'jsonb', nullable: true })
  categoryIds: string[] | null

  @Column({ type: 'jsonb', nullable: true })
  attachmentIds: string[] | null

  @Column({ type: 'uuid', nullable: true })
  mainImageId: string | null

  // Version chain tracking
  @Column({ type: 'uuid', nullable: true })
  parentVersionId: string | null // Previous version in chain

  @ManyToOne(() => StoryVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentVersionId' })
  parentVersion: StoryVersion | null

  // Branch/merge support
  @Column({ type: 'varchar', length: 100, default: 'main' })
  branchName: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  tag: string | null // e.g., "release-1.0", "stable"

  @Column({ type: 'uuid', nullable: true })
  mergedFromVersionId: string | null // Source version if this is a merge

  @ManyToOne(() => StoryVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mergedFromVersionId' })
  mergedFromVersion: StoryVersion | null

  // Change tracking
  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null // Diff from previous version

  @Column({ type: 'text', nullable: true })
  changeSummary: string | null // Human-readable change description

  @Column({ type: 'int', default: 0 })
  changesCount: number // Number of fields changed

  // Content hash for deduplication
  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null // SHA-256 of content for duplicate detection

  // Author & timestamps
  @Column({ type: 'uuid' })
  createdBy: string

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  author: User

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @Column({ type: 'text', nullable: true })
  commitMessage: string | null // Optional version commit message

  // Rollback tracking
  @Column({ type: 'boolean', default: false })
  isRollback: boolean

  @Column({ type: 'uuid', nullable: true })
  rolledBackFromVersionId: string | null

  // Retention
  @Column({ type: 'boolean', default: false })
  isPinned: boolean // Pinned versions are never auto-deleted

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null // Optional expiration for auto-cleanup
}
