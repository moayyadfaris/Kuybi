import { BadRequestException, Injectable } from '@nestjs/common'

import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'
import { AttachmentMetadata, shouldForcePublic } from '../utils/attachment-image.util'

import { S3Service } from './s3.service'

/**
 * Public/private visibility of an attachment. The flag in the database and the ACL of
 * every stored object (original, thumbnail, size variants, placeholder) must change
 * together: changing only the flag left "private" files publicly downloadable, and
 * "public" files answering 403.
 */
@Injectable()
export class AttachmentVisibilityService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly attachmentRepository: AttachmentRepository
  ) {}

  /** Uploads default to public; the uploader may ask for private (except forced-public categories) */
  resolveRequested(category: string | undefined, requested: boolean | undefined): boolean {
    if (shouldForcePublic(category)) {
      if (requested === false) {
        throw new BadRequestException(`${category} attachments are always public`)
      }
      return true
    }
    return requested ?? true
  }

  /**
   * Makes the attachment public or private. Every object's ACL changes first, then the
   * row: if S3 fails half way the row still says what it said, and a retry finishes.
   */
  async setVisibility(attachment: Attachment, isPublic: boolean): Promise<Attachment> {
    if (!isPublic && shouldForcePublic(attachment.category ?? undefined)) {
      throw new BadRequestException(`${attachment.category} attachments are always public`)
    }
    if (attachment.isPublic === isPublic) {
      return attachment
    }

    await Promise.all(storageKeys(attachment).map(key => this.s3Service.setAcl(key, isPublic)))

    const updated = await this.attachmentRepository.update(attachment.id, { isPublic })
    return updated ?? { ...attachment, isPublic }
  }
}

/** Every S3 object stored for an attachment */
export function storageKeys(attachment: Attachment): string[] {
  const metadata = (attachment.metadata || {}) as AttachmentMetadata
  const keys = [
    attachment.path,
    attachment.thumbnailPath,
    ...Object.values(metadata.thumbnails ?? {}).map(thumb => thumb?.key),
    metadata.optimization?.placeholderKey
  ]
  return [...new Set(keys.filter((key): key is string => Boolean(key)))]
}
