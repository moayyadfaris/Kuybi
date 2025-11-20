/**
 * Content Status Enum
 *
 * Defines the publishing workflow status for post content.
 * This enum MUST match the database ENUM: content_status_enum
 *
 * Workflow Flow:
 * DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED
 *                       ↘ SCHEDULED → PUBLISHED
 *                                   ↘ DELETED
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 * @see src/core/database/migrations/1732000000000-create-post-types-enums.ts
 */
export enum ContentStatus {
  /**
   * Content is being created/edited and not visible to public
   * - Not searchable
   * - Only visible to author and editors
   * - Can be edited freely
   * - Default status for new content
   *
   * Example: New blog post being written
   */
  DRAFT = 'draft',

  /**
   * Content submitted for editorial review
   * - Not visible to public
   * - Visible to reviewers/editors
   * - Author may have limited edit permissions
   * - Awaiting approval to publish
   *
   * Example: Article submitted for editor approval
   */
  PENDING_REVIEW = 'pending_review',

  /**
   * Content is live and publicly visible
   * - Visible to public (based on ACL)
   * - Searchable and indexable
   * - Published timestamp set
   * - Can still be edited (version control in Phase 3)
   *
   * Example: Live product listing, active event
   */
  PUBLISHED = 'published',

  /**
   * Content scheduled for future publication
   * - Not yet visible to public
   * - Will auto-publish at scheduledAt timestamp
   * - Can be edited before publication
   * - Visible in admin with scheduled badge
   *
   * Example: Blog post scheduled for next week
   */
  SCHEDULED = 'scheduled',

  /**
   * Content moved to archive (no longer active)
   * - Hidden from public listings
   * - Still accessible via direct URL (optional)
   * - Searchable in archive section only
   * - Can be restored to published
   *
   * Example: Past event, discontinued product
   */
  ARCHIVED = 'archived',

  /**
   * Content soft-deleted (recoverable)
   * - Not visible anywhere to public
   * - Only visible in admin trash
   * - Can be restored or permanently deleted
   * - deletedAt timestamp set
   *
   * Note: This status works with deletedAt column for soft delete pattern
   * Example: Deleted post in trash bin
   */
  DELETED = 'deleted'
}
