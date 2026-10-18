/**
 * Public API of the attachments module. Other modules import only from here
 * (or from @modules/attachments/entities); everything else is internal.
 */
export { AttachmentsModule } from './attachments.module'
export { AttachmentsJobsModule } from './jobs/attachments-jobs.module'
export { AttachmentRepository } from './repositories/attachment.repository'
export { S3Service } from './services/s3.service'
export { AttachmentMetadata } from './utils/attachment-image.util'
export { toAttachmentResponse } from './utils/attachment-url.util'
export { assertAttachmentUsable } from './utils/attachment-usability'
