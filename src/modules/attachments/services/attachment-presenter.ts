import { Injectable } from '@nestjs/common'

import { AttachmentResponseDto } from '../dto/attachment-response.dto'
import { Attachment } from '../entities/attachment.entity'
import { AttachmentMetadata } from '../utils/attachment-image.util'

import { S3Service } from './s3.service'

/** Metadata fields a client may see: image facts and processing state, no storage keys */
const PUBLIC_METADATA = [
  'width',
  'height',
  'format',
  'hasLocation',
  'processingStatus',
  'rejectionReasons'
] as const

/**
 * The API shape of an attachment, for this module and every module that embeds one
 * (stories). An allowlist: the entity also holds the encryption key, scan results and,
 * when joined, the uploader's account, none of which may reach a response. Storage URLs
 * are given only for public files; private ones are read through download or a
 * presigned URL.
 */
@Injectable()
export class AttachmentPresenter {
  constructor(private readonly s3Service: S3Service) {}

  present(attachment: Attachment): AttachmentResponseDto {
    const metadata = (attachment.metadata ?? {}) as AttachmentMetadata
    const publicUrl = (key?: string | null) =>
      attachment.isPublic && key ? this.s3Service.getPublicUrl(key) : undefined

    return {
      id: attachment.id,
      userId: attachment.userId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      category: attachment.category,
      description: attachment.description,
      tags: attachment.tags,
      folder: attachment.folder,
      isPublic: attachment.isPublic,
      isEncrypted: attachment.isEncrypted,
      securityStatus: attachment.securityStatus,
      checksum: attachment.checksum,
      downloadCount: attachment.downloadCount,
      lastAccessedAt: attachment.lastAccessedAt,
      expiresAt: attachment.expiresAt,
      version: attachment.version,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
      deletedAt: attachment.deletedAt,
      metadata: Object.fromEntries(
        PUBLIC_METADATA.filter(field => metadata[field] !== undefined).map(field => [
          field,
          metadata[field]
        ])
      ),
      url: publicUrl(attachment.path),
      originalImageUrl: publicUrl(attachment.path),
      previewUrl: publicUrl(attachment.thumbnailPath),
      placeholderUrl: publicUrl(metadata.optimization?.placeholderKey),
      thumbnails: Object.fromEntries(
        Object.entries(metadata.thumbnails ?? {})
          .filter(([, thumb]) => thumb?.key)
          .map(([variant, thumb]) => [
            variant,
            {
              url: publicUrl(thumb.key),
              width: thumb.width,
              height: thumb.height,
              size: thumb.size,
              format: thumb.format
            }
          ])
      ),
      downloadUrl: `/api/v1/attachments/${attachment.id}/download`
    }
  }
}
