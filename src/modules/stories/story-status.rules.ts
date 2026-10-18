import { BadRequestException } from '@nestjs/common'

import { StoryStatus } from './entities/story.entity'

/**
 * Statuses an author may set on their own story: working on it and submitting it for
 * review. Every other status is an editorial decision and requires Publish.
 */
export const AUTHOR_STATUSES: ReadonlySet<StoryStatus> = new Set([
  StoryStatus.DRAFT,
  StoryStatus.PENDING_REVIEW
])

/** Rejects transitions the workflow does not allow, whoever asks */
export function assertStatusTransition(from: StoryStatus | undefined, to: StoryStatus): void {
  if (to === StoryStatus.DELETED) {
    // Soft delete also records who and why; it has its own endpoint
    throw new BadRequestException('Use DELETE /stories/:id to delete a story')
  }
  if (from === StoryStatus.PUBLISHED && to === StoryStatus.DRAFT) {
    throw new BadRequestException('Cannot revert published story to draft')
  }
  if (from === StoryStatus.DELETED && to !== StoryStatus.DRAFT) {
    throw new BadRequestException('Deleted stories can only be restored to draft status')
  }
}
