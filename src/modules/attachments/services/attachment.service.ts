import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { errorMessage } from '@shared/utils/error.util'
import * as crypto from 'crypto'
import { PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import { User } from '@modules/users/entities'

import { OutboxService } from '@core/outbox'
import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'

import {
  AttachmentQueryDto,
  AttachmentResponseDto,
  AttachmentStatsDto,
  PresignedUrlDto,
  PresignedUrlResponseDto,
  UpdateAttachmentDto,
  UploadAttachmentDto
} from '../dto'
import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'
import {
  AttachmentMetadata,
  extractFormatFromMime,
  mapFormatToContentType,
  resolveExtensionFromFormat,
  shouldForcePublic,
  ThumbnailMetadata
} from '../utils/attachment-image.util'

import { AttachmentAccessPolicy } from './attachment-access.policy'
import { ExifProcessorService } from './exif-processor.service'
import { FileValidationService, MulterFile } from './file-validation.service'
import { ImageOptimizationService } from './image-optimization.service'
import { ImageProcessingService } from './image-processing.service'
import { S3Service } from './s3.service'

@Injectable()
export class AttachmentService {
  private readonly useAsyncProcessing: boolean

  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly fileValidationService: FileValidationService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly imageOptimizationService: ImageOptimizationService,
    private readonly exifProcessorService: ExifProcessorService,
    private readonly s3Service: S3Service,
    private readonly accessPolicy: AttachmentAccessPolicy,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly outbox: OutboxService
  ) {
    this.logger.setContext(AttachmentService.name)
    // Enable async processing via environment variable
    this.useAsyncProcessing =
      this.configService.get<string>('ATTACHMENT_ASYNC_PROCESSING') === 'true'
  }

  async uploadAttachment(
    file: MulterFile,
    dto: UploadAttachmentDto,
    userId: string
  ): Promise<AttachmentResponseDto> {
    const validationResult = await this.fileValidationService.validateFile(file)
    if (!validationResult.isValid) {
      throw new BadRequestException('File validation failed: ' + validationResult.errors.join(', '))
    }
    // From here on use the content-verified type, never the client-declared one
    file.mimetype = validationResult.verifiedMimeType ?? file.mimetype

    const isPublic = shouldForcePublic(dto.category) || dto.isPublic
    const isImage = file.mimetype.startsWith('image/')

    let processedBuffer = file.buffer
    let metadata: AttachmentMetadata = {}
    let thumbnailPath: string | undefined
    let processedFormat: string | undefined = extractFormatFromMime(file.mimetype)
    let placeholderBuffer: Buffer | undefined

    // Process images with advanced optimization and EXIF stripping
    if (isImage) {
      try {
        // Strip sensitive EXIF data first
        const exifResult = await this.exifProcessorService.stripSensitiveData(file.buffer, {
          stripSensitiveData: true,
          preserveCopyright: true,
          preserveColorProfile: true,
          autoRotate: true
        })
        processedBuffer = exifResult.buffer

        // Generate metadata summary (safe, no GPS/sensitive info)
        const summary = await this.exifProcessorService.generateMetadataSummary(file.buffer)
        metadata = { ...summary } as AttachmentMetadata

        // Validate metadata for security concerns
        const metadataValidation = await this.exifProcessorService.validateMetadata(file.buffer)
        if (!metadataValidation.valid) {
          this.logger.warn(
            { issues: metadataValidation.issues },
            'Image metadata validation issues detected'
          )
        }
        metadata.validation = metadataValidation

        // Generate optimized responsive image set
        const optimizationResult = await this.imageOptimizationService.optimizeImage(
          processedBuffer,
          {
            maxWidth: 2048,
            maxHeight: 2048,
            quality: 85,
            stripMetadata: true,
            autoRotate: false, // Already rotated by EXIF processor
            generateWebP: true,
            generateAVIF: true,
            generatePlaceholder: true
          }
        )

        // Use the optimized buffer
        processedBuffer = optimizationResult.buffer
        processedFormat = optimizationResult.format || processedFormat

        // Upload thumbnail (Low-Quality Image Placeholder)
        if (optimizationResult.placeholder) {
          placeholderBuffer = optimizationResult.placeholder
        }

        // Store optimization metadata
        metadata.optimization = {
          originalSize: optimizationResult.originalSize,
          optimizedSize: optimizationResult.size,
          compressionRatio: optimizationResult.compressionRatio,
          format: optimizationResult.format,
          width: optimizationResult.width,
          height: optimizationResult.height,
          hasWebP: !!optimizationResult.webp,
          hasAVIF: !!optimizationResult.avif,
          hasPlaceholder: !!optimizationResult.placeholder
        }

        this.logger.info(
          {
            originalSize: optimizationResult.originalSize,
            optimizedSize: optimizationResult.size,
            ratio: optimizationResult.compressionRatio
          },
          'Image optimized successfully'
        )
      } catch (error) {
        this.logger.error({ error: errorMessage(error) }, 'Image processing failed, using original')
        // Continue with original buffer if processing fails
      }
    }

    const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex')

    // Check for duplicate uploads (same checksum, same user)
    if (!dto.allowDuplicates) {
      const existing = await this.attachmentRepository.findByChecksum(userId, checksum)

      if (existing && !existing.deletedAt) {
        this.logger.info(
          { checksum, userId, existingId: existing.id },
          'Duplicate upload detected, returning existing attachment'
        )
        return this.formatAttachmentResponse(existing)
      }
    }

    const storageExtension = resolveExtensionFromFormat(
      processedFormat,
      file.mimetype,
      file.originalname
    )
    const storageKey = this.s3Service.generateKey(userId, file.originalname, dto.category, {
      extension: storageExtension
    })

    const storedMimeType = isImage ? mapFormatToContentType(processedFormat) : file.mimetype

    await this.s3Service.upload({
      key: storageKey,
      buffer: processedBuffer,
      contentType: storedMimeType,
      isPublic
    })

    if (placeholderBuffer) {
      const placeholderKey = this.s3Service.generateVariantKey(storageKey, 'placeholder', '.jpg')
      await this.s3Service.upload({
        key: placeholderKey,
        buffer: placeholderBuffer,
        contentType: 'image/jpeg',
        isPublic
      })
      metadata.optimization = {
        ...(metadata.optimization || {}),
        placeholderKey
      }
    }

    if (isImage && dto.generateThumbnails !== false) {
      try {
        const { thumbnails: uploadedThumbnails, previewKey } = await this.uploadThumbnailVariants(
          storageKey,
          processedBuffer,
          isPublic
        )
        thumbnailPath = previewKey
        metadata.thumbnails = uploadedThumbnails
      } catch (error) {
        this.logger.error(
          { error: error instanceof Error ? error.message : 'Unknown', storageKey },
          'Failed to upload thumbnail variants'
        )
      }
    }

    const attachment = await this.attachmentRepository.create({
      userId,
      originalName: file.originalname,
      mimeType: storedMimeType,
      size: processedBuffer.length,
      path: storageKey,
      category: dto.category,
      description: dto.description,
      tags: dto.tags || [],
      isPublic,
      checksum,
      securityStatus: 'pending',
      thumbnailPath,
      metadata
    } as Partial<Attachment>)

    return this.formatAttachmentResponse(attachment)
  }

  /**
   * Upload attachment with async processing via queue
   * Creates attachment record immediately but processes image in background
   */
  async uploadAttachmentAsync(
    file: MulterFile,
    dto: UploadAttachmentDto,
    userId: string
  ): Promise<AttachmentResponseDto> {
    const validationResult = await this.fileValidationService.validateFile(file)
    if (!validationResult.isValid) {
      throw new BadRequestException('File validation failed: ' + validationResult.errors.join(', '))
    }
    // From here on use the content-verified type, never the client-declared one
    file.mimetype = validationResult.verifiedMimeType ?? file.mimetype

    const isPublic = shouldForcePublic(dto.category) || dto.isPublic
    const isImage = file.mimetype.startsWith('image/')
    const processedFormat = isImage ? extractFormatFromMime(file.mimetype) : undefined
    const storageExtension = resolveExtensionFromFormat(
      processedFormat,
      file.mimetype,
      file.originalname
    )
    const storageKey = this.s3Service.generateKey(userId, file.originalname, dto.category, {
      extension: storageExtension
    })

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex')
    const storedMimeType = isImage ? mapFormatToContentType(processedFormat) : file.mimetype

    // Upload original file to S3 first
    await this.s3Service.upload({
      key: storageKey,
      buffer: file.buffer,
      contentType: storedMimeType,
      isPublic
    })

    // The record and its processing job commit together: no attachment can be left
    // "processing" forever because the job was lost (or queued for a rolled-back row)
    const attachment = await this.attachmentRepository.transaction(async manager => {
      const attachment = await manager.save(
        manager.create(Attachment, {
          userId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: storageKey,
          category: dto.category,
          description: dto.description,
          tags: dto.tags || [],
          isPublic,
          checksum,
          securityStatus: 'processing',
          metadata: { processingStatus: 'queued' }
        } as Partial<Attachment>)
      )
      if (isImage) {
        await this.outbox.enqueue(
          {
            queue: QueueName.ATTACHMENT_PROCESSING,
            name: AttachmentJobType.PROCESS_IMAGE,
            data: {
              attachmentId: attachment.id,
              s3Key: storageKey,
              originalName: file.originalname,
              userId,
              category: dto.category,
              isPublic,
              generateThumbnails: dto.generateThumbnails !== false
            },
            options: {
              priority: 5,
              attempts: 2
            }
          },
          manager
        )
      }
      return attachment
    })

    if (isImage) {
      this.logger.info({ attachmentId: attachment.id }, 'Image processing job queued')
    }

    return this.formatAttachmentResponse(attachment)
  }

  async getById(id: string, currentUser: User): Promise<AttachmentResponseDto> {
    const attachment = await this.findReadable(id, currentUser)
    return this.formatAttachmentResponse(attachment)
  }

  /**
   * Loads an attachment the user may read. Someone else's private file answers 404, not
   * 403, so its existence is not revealed.
   */
  private async findReadable(id: string, currentUser: User): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment || !this.accessPolicy.can(currentUser, Action.Read, attachment)) {
      throw new NotFoundException('Attachment not found')
    }
    return attachment
  }

  async listAll(query: AttachmentQueryDto, currentUser: User) {
    const result = await this.attachmentRepository.listAll({
      visibleToUserId: this.accessPolicy.canReadAll(currentUser) ? undefined : currentUser.id,
      category: query.category,
      mimeType: query.mimeType,
      isPublic: query.isPublic,
      securityStatus: query.securityStatus,
      minSize: query.minSize,
      maxSize: query.maxSize,
      startDate: query.startDate,
      endDate: query.endDate,
      includeDeleted: query.includeDeleted,
      page: query.page || 1,
      limit: query.limit || 20,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'DESC'
    })

    return {
      data: result.data.map(a => this.formatAttachmentResponse(a)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.ceil(result.total / result.limit)
    }
  }

  async getUserAttachments(userId: string, query: AttachmentQueryDto, currentUser: User) {
    // Other users' file lists are only for roles that may read their private files
    if (userId !== currentUser.id && !this.accessPolicy.canReadAll(currentUser)) {
      throw new ForbiddenException("You cannot list another user's attachments")
    }
    const attachments = await this.attachmentRepository.findByUserId(userId, query)
    return {
      data: attachments.map(a => this.formatAttachmentResponse(a)),
      total: attachments.length,
      page: query.page || 1,
      limit: query.limit || 20
    }
  }

  async updateMetadata(
    id: string,
    dto: UpdateAttachmentDto,
    currentUser: User
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Update, attachment, 'Access denied')

    const updated = await this.attachmentRepository.update(id, dto as Partial<Attachment>)
    return this.formatAttachmentResponse(updated!)
  }

  async softDelete(id: string, currentUser: User) {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Delete, attachment, 'Access denied')

    await this.attachmentRepository.softDelete(id)
    return { message: 'Attachment deleted successfully' }
  }

  async hardDelete(id: string, currentUser: User) {
    const attachment = await this.attachmentRepository.findByIdWithOptions(id, true)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Delete, attachment, 'Access denied')

    await this.s3Service.delete(attachment.path)
    await this.attachmentRepository.hardDelete(id)
    return { message: 'Attachment permanently deleted' }
  }

  async restore(id: string, currentUser: User): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findByIdWithOptions(id, true)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Restore, attachment, 'Access denied')

    await this.attachmentRepository.restore(id)
    const restored = await this.attachmentRepository.findById(id)
    return this.formatAttachmentResponse(restored!)
  }

  async generatePresignedUrl(
    id: string,
    dto: PresignedUrlDto,
    currentUser: User
  ): Promise<PresignedUrlResponseDto> {
    const attachment = await this.findReadable(id, currentUser)

    const url = await this.s3Service.getPresignedUrl(attachment.path, dto.expiresIn || 3600)
    await this.attachmentRepository.incrementDownloadCount(id)

    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + (dto.expiresIn || 3600))

    return { url, expiresAt, expiresIn: dto.expiresIn || 3600 }
  }

  async getStatistics(): Promise<AttachmentStatsDto> {
    return this.attachmentRepository.getStatistics() as Promise<AttachmentStatsDto>
  }

  async cleanupOrphaned(olderThanDays = 7) {
    const orphaned = await this.attachmentRepository.findOrphanedAttachments(olderThanDays)
    let deleted = 0,
      totalSize = 0

    for (const attachment of orphaned) {
      try {
        await this.s3Service.delete(attachment.path)
        await this.attachmentRepository.hardDelete(attachment.id)
        deleted++
        totalSize += attachment.size
      } catch (error) {
        this.logger.error(`Failed to delete orphaned attachment ${attachment.id}`)
      }
    }

    return { deleted, totalSize }
  }

  async downloadAttachment(id: string, currentUser: User) {
    const attachment = await this.findReadable(id, currentUser)

    const buffer = await this.s3Service.download(attachment.path)
    await this.attachmentRepository.incrementDownloadCount(id)

    return { buffer, attachment }
  }

  private formatAttachmentResponse(attachment: Attachment): AttachmentResponseDto {
    const metadata = (attachment.metadata || {}) as AttachmentMetadata
    const optimization = metadata.optimization
    const thumbnailsMeta = metadata.thumbnails
    const allowPublicUrls = attachment.isPublic

    let thumbnails:
      | Record<
          string,
          {
            key: string
            url?: string
            width?: number
            height?: number
            size?: number
            format?: string
          }
        >
      | undefined

    if (thumbnailsMeta && typeof thumbnailsMeta === 'object') {
      thumbnails = Object.entries(thumbnailsMeta).reduce(
        (acc, [variant, data]) => {
          if (data && typeof data === 'object') {
            const key = data.key
            if (!key) {
              return acc
            }
            acc[variant] = {
              key,
              url: allowPublicUrls ? this.s3Service.getPublicUrl(key) : undefined,
              width: data.width,
              height: data.height,
              size: data.size,
              format: data.format
            }
          }
          return acc
        },
        {} as Record<
          string,
          {
            key: string
            url?: string
            width?: number
            height?: number
            size?: number
            format?: string
          }
        >
      )
    }

    const placeholderKey = optimization?.placeholderKey
    const placeholderUrl =
      allowPublicUrls && placeholderKey ? this.s3Service.getPublicUrl(placeholderKey) : undefined

    return {
      ...attachment,
      url: allowPublicUrls ? this.s3Service.getPublicUrl(attachment.path) : undefined,
      originalImageUrl: allowPublicUrls ? this.s3Service.getPublicUrl(attachment.path) : undefined,
      downloadUrl: `/api/attachments/${attachment.id}/download`,
      previewUrl:
        allowPublicUrls && attachment.thumbnailPath
          ? this.s3Service.getPublicUrl(attachment.thumbnailPath)
          : undefined,
      thumbnails,
      placeholderUrl
    }
  }

  private async uploadThumbnailVariants(
    baseKey: string,
    buffer: Buffer,
    isPublic: boolean
  ): Promise<{ thumbnails: Record<string, ThumbnailMetadata>; previewKey?: string }> {
    const generated = await this.imageProcessingService.generateThumbnails(buffer)
    const thumbnails: Record<string, ThumbnailMetadata> = {}

    await Promise.all(
      Object.entries(generated).map(async ([variant, data]) => {
        const extension = resolveExtensionFromFormat(data.format)
        const key = this.s3Service.generateVariantKey(baseKey, variant, extension)

        await this.s3Service.upload({
          key,
          buffer: data.buffer,
          contentType: mapFormatToContentType(data.format),
          isPublic
        })

        thumbnails[variant] = {
          key,
          width: data.width,
          height: data.height,
          size: data.size,
          format: data.format
        }
      })
    )

    const previewPriority = ['medium', 'large', 'small', 'preview']
    let previewKey: string | undefined

    for (const variant of previewPriority) {
      const entry = thumbnails[variant]
      if (entry) {
        previewKey = entry.key
        break
      }
    }

    if (!previewKey) {
      const first = Object.values(thumbnails)[0]
      previewKey = first?.key
    }

    return { thumbnails, previewKey }
  }
}
