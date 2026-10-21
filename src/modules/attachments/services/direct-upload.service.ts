import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { errorMessage } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'

import { User } from '@modules/users/entities'

import { OutboxService } from '@core/outbox'
import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'

import { AttachmentResponseDto, InitiateUploadDto, InitiateUploadResponseDto } from '../dto'
import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'

import { AttachmentService } from './attachment.service'
import { AttachmentVisibilityService } from './attachment-visibility.service'
import { FileValidationService, MulterFile } from './file-validation.service'
import { isPreconditionFailed, S3Service } from './s3.service'

/** How long the presigned upload stays valid */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Bytes read back from storage to verify the content type (enough for magic numbers) */
export const CONTENT_SNIFF_BYTES = 64 * 1024
/** Uploads not completed within this time are deleted (row and object) */
export const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000

const PENDING = 'pending_upload'
const VERIFYING = 'verifying'

interface DirectUploadMetadata {
  processingStatus?: string
  generateThumbnails?: boolean
  rejectionReasons?: string[]
  /** Where the client uploads; the attachment's own key is never handed out */
  uploadKey?: string
}

/** Prefix of upload keys (a bucket lifecycle rule may expire it as a backstop) */
const UPLOAD_KEY_PREFIX = 'incoming'

/**
 * Uploads that go from the client straight to S3, so file bytes never pass through
 * (or sit in the memory of) the API:
 *
 * 1. initiate: validate what the client declares, create a 'pending_upload' record,
 *    return a presigned POST pinned to an upload key, exact size and Content-Type
 * 2. the client uploads to S3
 * 3. complete: check the object's size, verify its content type from the first bytes,
 *    copy exactly that version to the attachment's key, then mark it ready and queue
 *    image processing (atomically, via the outbox)
 *
 * The presigned POST stays usable until it expires, so the client could re-upload other
 * bytes to the upload key at any time. Completion therefore binds everything to one
 * version (its ETag): the content check reads that version (If-Match) and the copy takes
 * it (CopySourceIfMatch); a swap in between fails (409, complete again). What is served
 * and processed lives under a key the client was never given.
 */
@Injectable()
export class DirectUploadService {
  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly attachmentService: AttachmentService,
    private readonly fileValidation: FileValidationService,
    private readonly s3Service: S3Service,
    private readonly outbox: OutboxService,
    private readonly logger: PinoLogger,
    private readonly visibility: AttachmentVisibilityService
  ) {
    this.logger.setContext(DirectUploadService.name)
  }

  async initiate(dto: InitiateUploadDto, user: User): Promise<InitiateUploadResponseDto> {
    const declared = { originalname: dto.originalName, mimetype: dto.mimeType, size: dto.size }
    const validation = this.fileValidation.validateDeclaredFile(declared)
    if (!validation.isValid) {
      throw new BadRequestException('File validation failed: ' + validation.errors.join(', '))
    }

    const key = this.s3Service.generateKey(user.id, dto.originalName, dto.category)
    const uploadKey = `${UPLOAD_KEY_PREFIX}/${key}`
    const metadata: DirectUploadMetadata = {
      processingStatus: 'awaiting_upload',
      generateThumbnails: dto.generateThumbnails !== false,
      uploadKey
    }
    const attachment = await this.attachmentRepository.transaction(manager =>
      manager.save(
        manager.create(Attachment, {
          userId: user.id,
          originalName: dto.originalName,
          mimeType: dto.mimeType,
          size: dto.size,
          path: key,
          category: dto.category,
          description: dto.description,
          tags: dto.tags ?? [],
          isPublic: this.visibility.resolveRequested(dto.category, dto.isPublic),
          securityStatus: PENDING,
          metadata
        } as Partial<Attachment>)
      )
    )

    const upload = await this.s3Service.createPresignedUpload({
      key: uploadKey,
      contentType: dto.mimeType,
      size: dto.size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS
    })

    this.logger.info(
      { attachmentId: attachment.id, userId: user.id, size: dto.size },
      'Direct upload initiated'
    )
    return {
      attachmentId: attachment.id,
      upload: { method: 'POST', ...upload },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000)
    }
  }

  async complete(id: string, user: User): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findFresh(id)
    if (!attachment || attachment.userId !== user.id) {
      throw new NotFoundException('Upload not found')
    }

    // Claim it: of two concurrent completions only one verifies the file
    const claimed = await this.attachmentRepository.transitionSecurityStatus(id, PENDING, VERIFYING)
    if (!claimed) {
      throw new ConflictException('This upload has already been completed')
    }

    const metadata = (attachment.metadata ?? {}) as DirectUploadMetadata
    // Uploads started before upload keys existed went straight to the attachment's key
    const uploadKey = metadata.uploadKey ?? attachment.path

    let stored: { contentLength?: number; etag?: string }
    try {
      stored = await this.s3Service.getMetadata(uploadKey)
    } catch {
      // Not uploaded (yet): let the client upload and complete again
      await this.attachmentRepository.update(id, { securityStatus: PENDING })
      throw new ConflictException('The file has not been uploaded yet')
    }

    try {
      if (stored.contentLength !== attachment.size) {
        return await this.reject(attachment, [
          `Uploaded ${stored.contentLength ?? 0} bytes, expected ${attachment.size}`
        ])
      }

      const head = await this.s3Service.readHead(uploadKey, CONTENT_SNIFF_BYTES, stored.etag)
      const verdict = await this.fileValidation.validateFile(
        {
          originalname: attachment.originalName,
          mimetype: attachment.mimeType,
          size: attachment.size,
          buffer: head
        } as MulterFile,
        { truncatedContent: head.length < attachment.size }
      )
      if (!verdict.isValid) {
        return await this.reject(attachment, verdict.errors)
      }

      // Exactly the version that was checked, to a key the client cannot write
      if (uploadKey !== attachment.path) {
        await this.s3Service.copyIfUnchanged(uploadKey, attachment.path, stored.etag ?? '')
        await this.s3Service
          .delete(uploadKey)
          .catch(error =>
            this.logger.warn(
              { key: uploadKey, error: errorMessage(error) },
              'Upload key not deleted'
            )
          )
      }

      const mimeType = verdict.verifiedMimeType ?? attachment.mimeType
      const isImage = mimeType.startsWith('image/')

      // Images stay private until processing has replaced them with an EXIF-stripped copy
      // (the processor applies the public ACL then); other files can be public now
      if (attachment.isPublic && !isImage) {
        await this.s3Service.makePublic(attachment.path)
      }

      await this.attachmentRepository.transaction(async manager => {
        await manager.update(Attachment, id, {
          mimeType,
          securityStatus: isImage ? 'processing' : 'completed',
          metadata: {
            ...metadata,
            uploadKey: undefined,
            processingStatus: isImage ? 'queued' : 'completed'
          }
        })
        if (isImage) {
          await this.outbox.enqueue(
            {
              queue: QueueName.ATTACHMENT_PROCESSING,
              name: AttachmentJobType.PROCESS_IMAGE,
              data: {
                attachmentId: id,
                s3Key: attachment.path,
                originalName: attachment.originalName,
                userId: user.id,
                category: attachment.category,
                isPublic: attachment.isPublic,
                generateThumbnails: metadata.generateThumbnails !== false
              },
              options: { priority: 5, attempts: 2 }
            },
            manager
          )
        }
      })
    } catch (error) {
      if (!(error instanceof UnprocessableEntityException)) {
        // Unexpected failure while verifying: allow another completion attempt
        await this.attachmentRepository.transitionSecurityStatus(id, VERIFYING, PENDING)
      }
      if (isPreconditionFailed(error)) {
        throw new ConflictException('The file changed while it was being checked; complete again')
      }
      throw error
    }

    this.logger.info({ attachmentId: id, userId: user.id }, 'Direct upload completed')
    return this.attachmentService.getById(id, user)
  }

  private async reject(attachment: Attachment, reasons: string[]): Promise<never> {
    for (const key of storedKeys(attachment)) {
      await this.s3Service
        .delete(key)
        .catch(error =>
          this.logger.warn({ key, error: errorMessage(error) }, 'Could not delete rejected upload')
        )
    }
    await this.attachmentRepository.transaction(manager =>
      manager.update(Attachment, attachment.id, {
        securityStatus: 'rejected',
        metadata: { ...(attachment.metadata ?? {}), rejectionReasons: reasons }
      })
    )
    this.logger.warn({ attachmentId: attachment.id, reasons }, 'Direct upload rejected')
    throw new UnprocessableEntityException({
      message: 'The uploaded file was rejected',
      errors: reasons
    })
  }

  /** Deletes uploads that were initiated but never completed */
  @Cron(CronExpression.EVERY_HOUR)
  async removeAbandonedUploads(): Promise<number> {
    const abandoned = await this.attachmentRepository.findStaleByStatus(
      PENDING,
      new Date(Date.now() - ABANDONED_UPLOAD_MS),
      500
    )
    for (const attachment of abandoned) {
      for (const key of storedKeys(attachment)) {
        await this.s3Service.delete(key).catch(() => undefined) // may never have been uploaded
      }
      await this.attachmentRepository.deleteIfStatus(attachment.id, PENDING)
    }
    if (abandoned.length > 0) {
      this.logger.info({ count: abandoned.length }, 'Removed abandoned direct uploads')
    }
    return abandoned.length
  }
}

/** The upload key (if any) and the attachment's own key */
function storedKeys(attachment: Attachment): string[] {
  const uploadKey = (attachment.metadata as DirectUploadMetadata | null)?.uploadKey
  return [...new Set([uploadKey, attachment.path].filter((key): key is string => !!key))]
}
