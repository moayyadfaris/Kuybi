import { AttachmentResponseDto } from '../dto/attachment-response.dto'
import { Attachment } from '../entities/attachment.entity'

const stripQuotes = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined
  return value.replace(/^['"]/, '').replace(/['"]$/, '')
}

const buildBaseUrl = (): string => {
  const configuredBaseUrl = stripQuotes(process.env.S3_BASE_URL)
  if (configuredBaseUrl && configuredBaseUrl.trim().length > 0) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  const bucket = stripQuotes(process.env.S3_BUCKET) || 'susano'
  const region = stripQuotes(process.env.S3_REGION) || 'eu-west-1'

  return `https://${bucket}.s3.${region}.amazonaws.com`
}

const attachmentBaseUrl = buildBaseUrl()

export const buildAttachmentPublicUrl = (path?: string | null): string | undefined => {
  if (!path) {
    return undefined
  }
  return `${attachmentBaseUrl}/${path}`
}

export const buildAttachmentDownloadUrl = (attachmentId: string): string =>
  `/api/attachments/${attachmentId}/download`

export const toAttachmentResponse = (attachment: Attachment): AttachmentResponseDto => {
  const originalImageUrl = buildAttachmentPublicUrl(attachment.path)
  const previewUrl = buildAttachmentPublicUrl(attachment.thumbnailPath)

  return {
    ...attachment,
    url: attachment.isPublic ? originalImageUrl : undefined,
    originalImageUrl,
    downloadUrl: buildAttachmentDownloadUrl(attachment.id),
    previewUrl
  } as AttachmentResponseDto
}
