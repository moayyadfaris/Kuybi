import { BadRequestException, Injectable } from '@nestjs/common'

import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'
import { AttachmentMetadata, shouldForcePublic } from '../utils/attachment-image.util'

import { S3Service } from './s3.service'

/**
 * States in which the stored object is still the raw upload (metadata not stripped, or
 * processing failed). Making it public would publish its GPS location and camera data.
 */
const UNPROCESSED = new Set(['pending_upload', 'verifying', 'processing', 'failed', 'rejected'])

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
   * Makes the attachment public or private. Runs on the locked row (see withLockedRow),
   * so a worker publishing the processed image waits and then applies the new value.
   * Every object's ACL changes first, then the row: if S3 fails half way the row still
   * says what it said (the transaction rolls back), and a retry finishes.
   */
  async setVisibility(attachment: Attachment, isPublic: boolean): Promise<Attachment> {
    if (!isPublic && shouldForcePublic(attachment.category ?? undefined)) {
      throw new BadRequestException(`${attachment.category} attachments are always public`)
    }
    if (attachment.isPublic === isPublic) {
      return attachment
    }

    const changed = await this.attachmentRepository.withLockedRow(
      attachment.id,
      async (current, manager) => {
        if (!current || current.isPublic === isPublic) return current
        // Unprocessed: record the choice only; the processor publishes the processed copy
        if (!(isPublic && UNPROCESSED.has(current.securityStatus))) {
          await this.applyAcl(current, isPublic && !current.deletedAt)
        }
        await manager.update(Attachment, current.id, { isPublic })
        return { ...current, isPublic }
      }
    )
    return changed ?? { ...attachment, isPublic }
  }

  /**
   * Soft-deletes the attachment and makes its objects private (a deleted file must not
   * stay downloadable through its public URL); restore() publishes them again.
   */
  async softDelete(id: string): Promise<boolean> {
    return this.attachmentRepository.withLockedRow(id, async (current, manager) => {
      if (!current) return false
      await this.applyAcl(current, false)
      await manager.update(Attachment, id, { deletedAt: new Date() })
      return true
    })
  }

  /** Undoes softDelete: the objects get the row's visibility back */
  async restore(id: string): Promise<boolean> {
    return this.attachmentRepository.withLockedRow(id, async (current, manager) => {
      if (!current) return false
      await manager.update(Attachment, id, { deletedAt: null })
      await this.applyAcl(current, current.isPublic && !UNPROCESSED.has(current.securityStatus))
      return true
    })
  }

  /**
   * Gives every stored object the visibility the row has now (private when deleted), on
   * the locked row: an owner's change in flight finishes first. 'gone' when the row was
   * deleted for good; the caller removes what it stored.
   */
  async applyStoredVisibility(id: string): Promise<'applied' | 'gone'> {
    return this.attachmentRepository.withLockedRow(id, async current => {
      if (!current) return 'gone'
      await this.applyAcl(current, current.isPublic && !current.deletedAt)
      return 'applied'
    })
  }

  private async applyAcl(attachment: Attachment, isPublic: boolean): Promise<void> {
    await Promise.all(storageKeys(attachment).map(key => this.s3Service.setAcl(key, isPublic)))
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
