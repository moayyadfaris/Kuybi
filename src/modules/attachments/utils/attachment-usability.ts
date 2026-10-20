import { BadRequestException } from '@nestjs/common'

import type { Attachment } from '../entities/attachment.entity'

/**
 * Direct uploads in these states have not been verified (content type, EXIF stripping)
 * or were rejected, so they must not be used as a profile or story image or be linked.
 */
const NOT_READY = new Set(['pending_upload', 'verifying', 'rejected'])

/** 400 unless the file can be used (linked, set as an image): uploaded, verified, not deleted */
export function assertAttachmentUsable(
  attachment: Pick<Attachment, 'id' | 'securityStatus' | 'deletedAt'>
): void {
  if (attachment.deletedAt) {
    throw new BadRequestException(`Attachment ${attachment.id} was deleted`)
  }
  if (NOT_READY.has(attachment.securityStatus)) {
    throw new BadRequestException(
      `Attachment ${attachment.id} has not finished uploading or was rejected`
    )
  }
}
