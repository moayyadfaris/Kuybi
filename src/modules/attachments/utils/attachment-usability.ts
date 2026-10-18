import { BadRequestException } from '@nestjs/common'

import type { Attachment } from '../entities/attachment.entity'

/**
 * Direct uploads in these states have not been verified (content type, EXIF stripping)
 * or were rejected, so they must not be used as a profile or story image or be linked.
 */
const NOT_READY = new Set(['pending_upload', 'verifying', 'rejected'])

export function assertAttachmentUsable(
  attachment: Pick<Attachment, 'id' | 'securityStatus'>
): void {
  if (NOT_READY.has(attachment.securityStatus)) {
    throw new BadRequestException(
      `Attachment ${attachment.id} has not finished uploading or was rejected`
    )
  }
}
