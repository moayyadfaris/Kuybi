import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import * as crypto from 'crypto'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { FileValidationService, MulterFile } from './file-validation.service'
import { ImageProcessingService } from './image-processing.service'
import { ImageOptimizationService } from './image-optimization.service'
import { ExifProcessorService } from './exif-processor.service'
import { S3Service } from './s3.service'
import { Attachment } from '../entities/attachment.entity'
import {
  UploadAttachmentDto,
  UpdateAttachmentDto,
  AttachmentQueryDto,
  AttachmentResponseDto,
  PresignedUrlDto,
  PresignedUrlResponseDto,
  AttachmentStatsDto
} from '../dto'

@Injectable()
export class AttachmentService {
  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly fileValidationService: FileValidationService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly imageOptimizationService: ImageOptimizationService,
    private readonly exifProcessorService: ExifProcessorService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(AttachmentService.name)
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

    let processedBuffer = file.buffer
    let metadata: Record<string, unknown> = {}
    let thumbnailPath: string | undefined

    // Process images with advanced optimization and EXIF stripping
    const isImage = file.mimetype.startsWith('image/')
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
        metadata = await this.exifProcessorService.generateMetadataSummary(file.buffer)

        // Validate metadata for security concerns
        const metadataValidation = await this.exifProcessorService.validateMetadata(file.buffer)
        if (!metadataValidation.valid) {
          this.logger.warn(
            { issues: metadataValidation.issues },
            'Image metadata validation issues detected'
          )
        }

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

        // Upload thumbnail (Low-Quality Image Placeholder)
        if (optimizationResult.placeholder) {
          const thumbnailKey = this.s3Service.generateKey(
            userId,
            `thumb_${file.originalname}`,
            dto.category
          )
          await this.s3Service.upload({
            key: thumbnailKey,
            buffer: optimizationResult.placeholder,
            contentType: 'image/jpeg',
            isPublic: dto.isPublic
          })
          thumbnailPath = thumbnailKey
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
        this.logger.error({ error: error.message }, 'Image processing failed, using original')
        // Continue with original buffer if processing fails
      }
    }

    const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex')
    const storageKey = this.s3Service.generateKey(userId, file.originalname, dto.category)

    await this.s3Service.upload({
      key: storageKey,
      buffer: processedBuffer,
      contentType: file.mimetype,
      isPublic: dto.isPublic
    })

    const attachment = await this.attachmentRepository.create({
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: processedBuffer.length,
      path: storageKey,
      category: dto.category,
      description: dto.description,
      tags: dto.tags || [],
      isPublic: dto.isPublic || false,
      checksum,
      securityStatus: 'pending',
      thumbnailPath,
      metadata
    } as Partial<Attachment>)

    return this.formatAttachmentResponse(attachment)
  }

  async getById(id: string): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }
    return this.formatAttachmentResponse(attachment)
  }

  async listAll(query: AttachmentQueryDto) {
    const result = await this.attachmentRepository.listAll({
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

  async getUserAttachments(userId: string, query: AttachmentQueryDto) {
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
    userId: string
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    if (attachment.userId !== userId) throw new ForbiddenException('Access denied')

    const updated = await this.attachmentRepository.update(id, dto as Partial<Attachment>)
    return this.formatAttachmentResponse(updated!)
  }

  async softDelete(id: string, userId: string) {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    if (attachment.userId !== userId) throw new ForbiddenException('Access denied')

    await this.attachmentRepository.softDelete(id)
    return { message: 'Attachment deleted successfully' }
  }

  async hardDelete(id: string, userId: string) {
    const attachment = await this.attachmentRepository.findByIdWithOptions(id, true)
    if (!attachment) throw new NotFoundException('Attachment not found')
    if (attachment.userId !== userId) throw new ForbiddenException('Access denied')

    await this.s3Service.delete(attachment.path)
    await this.attachmentRepository.hardDelete(id)
    return { message: 'Attachment permanently deleted' }
  }

  async restore(id: string, userId: string): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findByIdWithOptions(id, true)
    if (!attachment) throw new NotFoundException('Attachment not found')
    if (attachment.userId !== userId) throw new ForbiddenException('Access denied')

    await this.attachmentRepository.restore(id)
    const restored = await this.attachmentRepository.findById(id)
    return this.formatAttachmentResponse(restored!)
  }

  async generatePresignedUrl(id: string, dto: PresignedUrlDto): Promise<PresignedUrlResponseDto> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')

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

  async downloadAttachment(id: string) {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')

    const buffer = await this.s3Service.download(attachment.path)
    await this.attachmentRepository.incrementDownloadCount(id)

    return { buffer, attachment }
  }

  private formatAttachmentResponse(attachment: Attachment): AttachmentResponseDto {
    return {
      ...attachment,
      url: attachment.isPublic ? this.s3Service.getPublicUrl(attachment.path) : undefined,
      downloadUrl: `/api/attachments/${attachment.id}/download`,
      previewUrl: attachment.thumbnailPath
        ? this.s3Service.getPublicUrl(attachment.thumbnailPath)
        : undefined
    }
  }
}
