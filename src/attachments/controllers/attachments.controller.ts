import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  Body,
  Req,
  Param,
  Query,
  Res,
  StreamableFile
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger'
import { Request, Response } from 'express'
import { memoryStorage } from 'multer'
import { AttachmentService } from '../services/attachment.service'
import { UploadAttachmentDto, UpdateAttachmentDto, AttachmentQueryDto, PresignedUrlDto } from '../dto'
import { AbilityGuard } from '../../acl/abilities/ability.guard'
import { CheckAbility } from '../../acl/abilities/ability.decorator'
import { Action } from '../../acl/types/actions.enum'
import { Subject } from '../../acl/types/subjects.enum'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('v1/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
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
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'string' }
          ]
        },
        generateThumbnails: { type: 'boolean' },
        isPublic: { type: 'boolean' },
        allowDuplicates: { type: 'boolean' }
      },
      required: ['file']
    }
  })
  @ApiOkResponse({ description: 'Attachment uploaded successfully' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(
    @UploadedFile() file: any,
    @Body() body: UploadAttachmentDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User context missing; ensure auth guard adds req.user')
    }

    const result = await this.attachmentService.uploadAttachment(
      file as any,
      body,
      userId
    )

    return { attachment: result }
  }

  @Get('stats')
  @ApiOkResponse({ description: 'Get attachment statistics' })
  async getStatistics() {
    return this.attachmentService.getStatistics()
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment details retrieved' })
  async getById(@Param('id') id: string) {
    return this.attachmentService.getById(id)
  }

  @Get('user/:userId')
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiQuery({ name: 'category', required: false, type: 'string' })
  @ApiOkResponse({ description: 'User attachments retrieved' })
  async getUserAttachments(
    @Param('userId') userId: string,
    @Query() query: AttachmentQueryDto
  ) {
    return this.attachmentService.getUserAttachments(userId, query)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment metadata updated' })
  async updateMetadata(
    @Param('id') id: string,
    @Body() dto: UpdateAttachmentDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User context missing')
    }
    return this.attachmentService.updateMetadata(id, dto, userId)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment soft deleted' })
  async softDelete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User context missing')
    }
    return this.attachmentService.softDelete(id, userId)
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment permanently deleted (admin only)' })
  async hardDelete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User context missing')
    }
    return this.attachmentService.hardDelete(id, userId)
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Restore, subject: Subject.Attachment })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment restored' })
  async restore(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User context missing')
    }
    return this.attachmentService.restore(id, userId)
  }

  @Post(':id/presigned-url')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Presigned URL generated' })
  async generatePresignedUrl(
    @Param('id') id: string,
    @Body() dto: PresignedUrlDto
  ) {
    return this.attachmentService.generatePresignedUrl(id, dto)
  }

  @Get(':id/download')
  @ApiParam({ name: 'id', type: 'string' })
  @ApiOkResponse({ description: 'Attachment downloaded' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const { buffer, attachment } = await this.attachmentService.downloadAttachment(id)
    
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${attachment.originalName}"`,
      'Content-Length': buffer.length
    })

    return new StreamableFile(buffer)
  }

  @Post('cleanup-orphaned')
  @ApiQuery({ name: 'olderThanDays', required: false, type: 'number' })
  @ApiOkResponse({ description: 'Orphaned attachments cleaned up' })
  async cleanupOrphaned(@Query('olderThanDays') olderThanDays?: number) {
    return this.attachmentService.cleanupOrphaned(olderThanDays ? Number(olderThanDays) : 7)
  }

  private extractIp(request: Request): string | undefined {
    const forwarded = request.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim()
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0]
    }
    return request.ip
  }
}
