import { SetMetadata } from '@nestjs/common'
import { AuditAction } from '../entities/audit-log.entity'

export const AUDIT_LOG_KEY = 'audit_log'

export interface AuditLogMetadata {
  action: AuditAction
  entityType?: string
  description?: string
  includeBody?: boolean
  includeResponse?: boolean
}

/**
 * Decorator to automatically log controller actions
 *
 * @example
 * ```typescript
 * @AuditLog({
 *   action: AuditAction.CREATE,
 *   entityType: 'Story',
 *   description: 'Create new story'
 * })
 * async createStory(@Body() dto: CreateStoryDto) {
 *   // ...
 * }
 * ```
 */
export const AuditLog = (metadata: AuditLogMetadata) => SetMetadata(AUDIT_LOG_KEY, metadata)
