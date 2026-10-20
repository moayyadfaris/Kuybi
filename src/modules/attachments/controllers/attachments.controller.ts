import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger'
import { Request, Response } from 'express'
import { memoryStorage } from 'multer'

import { AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { JwtAuthGuard } from '@core/auth'
import { Idempotent } from '@core/idempotency'

import {
  AttachmentQueryDto,
  AttachmentResponseDto,
  InitiateUploadDto,
  InitiateUploadResponseDto,
  PresignedUrlDto,
  UpdateAttachmentDto,
  UploadAttachmentDto
} from '../dto'
import { AttachmentService } from '../services/attachment.service'
import { DirectUploadService } from '../services/direct-upload.service'
import { MAX_UPLOAD_BYTES } from '../services/file-validation.service'
import { contentDisposition } from '../utils/content-disposition.util'

interface AuthenticatedRequest extends Request {
  user?: User
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('v1/attachments')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AttachmentsController {
  private readonly asyncByDefault: boolean

  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly directUploadService: DirectUploadService,
    configService: ConfigService
  ) {
    this.asyncByDefault = configService.get<boolean>('attachments.asyncProcessing', false)
  }

  @Post()
  @Idempotent()
  @CheckAbility({ action: Action.Create, subject: Subject.Attachment })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary'
        },
        category: { type: 'string' },
        description: { type: 'string' },
        tags: {
          oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }]
        },
        generateThumbnails: { type: 'boolean' },
        isPublic: { type: 'boolean' },
        allowDuplicates: { type: 'boolean' },
        async: {
          type: 'boolean',
          description: 'Process image asynchronously in background queue'
        }
      },
      required: ['file']
    }
  })
  @ApiOkResponse({ description: 'Attachment uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Reject oversized uploads while streaming instead of buffering them first
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
    })
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadAttachmentDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = this.requireUser(req).id

    const useAsync = body.async ?? this.asyncByDefault

    const result = useAsync
      ? await this.attachmentService.uploadAttachmentAsync(file, body, userId)
      : await this.attachmentService.uploadAttachment(file, body, userId)

    return {
      attachment: result,
      processing: useAsync ? 'async' : 'sync'
    }
  }

  @Post('bulk')
  @Idempotent()
  @CheckAbility({ action: Action.Create, subject: Subject.Attachment })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' }
        },
        category: { type: 'string' },
        description: { type: 'string' },
        tags: {
          oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string' }]
        },
        generateThumbnails: { type: 'boolean' },
        isPublic: { type: 'boolean' },
        allowDuplicates: { type: 'boolean' },
        async: { type: 'boolean', description: 'Process images asynchronously' }
      },
      required: ['files']
    }
  })
  @ApiOkResponse({ description: 'Bulk attachments uploaded' })
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 }
    })
  )
  async bulkUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadAttachmentDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = this.requireUser(req).id

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided')
    }

    const useAsync = body.async ?? this.asyncByDefault

    const results = await Promise.allSettled(
      files.map(file =>
        useAsync
          ? this.attachmentService.uploadAttachmentAsync(file, body, userId)
          : this.attachmentService.uploadAttachment(file, body, userId)
      )
    )

    const attachments = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { success: true, attachment: result.value, processing: useAsync ? 'async' : 'sync' }
      }
      return {
        success: false,
        filename: files[index]?.originalname,
        error: result.reason?.message ?? 'Upload failed'
      }
    })

    return { attachments }
  }

  @Post('uploads')
  @CheckAbility({ action: Action.Create, subject: Subject.Attachment })
  @Idempotent()
  @ApiOperation({
    summary: 'Start a direct upload',
    description:
      'Returns a presigned POST: upload the file straight to storage with it, then call /uploads/:id/complete. File bytes never pass through the API.'
  })
  @ApiCreatedResponse({ type: InitiateUploadResponseDto })
  async initiateUpload(@Body() dto: InitiateUploadDto, @Req() req: AuthenticatedRequest) {
    return this.directUploadService.initiate(dto, this.requireUser(req))
  }

  @Post('uploads/:id/complete')
  @HttpCode(HttpStatus.OK)
  @CheckAbility({ action: Action.Create, subject: Subject.Attachment })
  @ApiOperation({
    summary: 'Finish a direct upload',
    description:
      'Verifies the stored file (size and content type) and queues processing. 409 if the file is not uploaded yet or the upload was already completed; 422 if the file is rejected.'
  })
  @ApiOkResponse({ type: AttachmentResponseDto })
  async completeUpload(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.directUploadService.complete(id, this.requireUser(req))
  }

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.Attachment })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'category', required: false, type: 'string' })
  @ApiQuery({ name: 'mimeType', required: false, type: 'string' })
  @ApiQuery({ name: 'isPublic', required: false, type: 'boolean' })
  @ApiQuery({ name: 'securityStatus', required: false, type: 'string' })
  @ApiQuery({ name: 'minSize', required: false, type: 'number' })
  @ApiQuery({ name: 'maxSize', required: false, type: 'number' })
  @ApiQuery({ name: 'startDate', required: false, type: 'string' })
  @ApiQuery({ name: 'endDate', required: false, type: 'string' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: 'boolean' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'size', 'originalName', 'downloadCount']
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiOkResponse({ description: 'List of attachments retrieved' })
  async list(@Query() query: AttachmentQueryDto, @Req() req: AuthenticatedRequest) {
    return this.attachmentService.listAll(query, this.requireUser(req))
  }

  @Get('stats')
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiOkResponse({ description: 'Get attachment statistics' })
  async getStatistics() {
    return this.attachmentService.getStatistics()
  }

  @Get(':id')
  @CheckAbility({ action: Action.Read, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment details retrieved' })
  async getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.attachmentService.getById(id, this.requireUser(req))
  }

  @Get('user/:userId')
  @CheckAbility({ action: Action.Read, subject: Subject.Attachment })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'category', required: false, type: 'string' })
  @ApiOkResponse({ description: 'User attachments retrieved' })
  async getUserAttachments(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: AttachmentQueryDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.attachmentService.getUserAttachments(userId, query, this.requireUser(req))
  }

  @Patch(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment metadata updated' })
  async updateMetadata(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttachmentDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.attachmentService.updateMetadata(id, dto, this.requireUser(req))
  }

  @Delete(':id')
  @CheckAbility({ action: Action.Delete, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment soft deleted' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.attachmentService.softDelete(id, this.requireUser(req))
  }

  @Delete(':id/hard')
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment permanently deleted (admin only)' })
  async hardDelete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.attachmentService.hardDelete(id, this.requireUser(req))
  }

  @Post(':id/restore')
  @CheckAbility({ action: Action.Restore, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment restored' })
  async restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    return this.attachmentService.restore(id, this.requireUser(req))
  }

  @Post(':id/presigned-url')
  @CheckAbility({ action: Action.Read, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Presigned URL generated' })
  async generatePresignedUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PresignedUrlDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.attachmentService.generatePresignedUrl(id, dto, this.requireUser(req))
  }

  @Get(':id/download')
  @CheckAbility({ action: Action.Read, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment downloaded' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const { buffer, attachment } = await this.attachmentService.downloadAttachment(
      id,
      this.requireUser(req)
    )

    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': contentDisposition(attachment.originalName),
      'Content-Length': buffer.length
    })

    return new StreamableFile(buffer)
  }

  private requireUser(req: AuthenticatedRequest): User {
    if (!req.user) {
      throw new UnauthorizedException('User context missing')
    }
    return req.user
  }
}
