/**
 * Queue Names - Central registry of all queues in the application
 */
export enum QueueName {
  SESSION_CLEANUP = 'session-cleanup-queue',
  EMAIL = 'email-queue',
  ATTACHMENT_PROCESSING = 'attachment-processing-queue',
  VERSION_CLEANUP = 'version-cleanup-queue',
  CONTENT_PUBLISHING = 'content-publishing-queue',
  AUDIT_RETENTION = 'audit-retention-queue',
  ACCOUNT_SECURITY = 'account-security-queue',
  DEAD_LETTER = 'dead-letter-queue'
}

/**
 * Session Cleanup Job Types
 */
export enum SessionCleanupJobType {
  CLEANUP_EXPIRED = 'cleanup-expired-sessions',
  CLEANUP_RESET_TOKENS = 'cleanup-expired-reset-tokens'
}

/**
 * Email Job Types
 */
export enum EmailJobType {
  SEND_WELCOME = 'send-welcome-email',
  SEND_PASSWORD_RESET = 'send-password-reset',
  SEND_NOTIFICATION = 'send-notification-email',
  SEND_BULK = 'send-bulk-email',
  SEND_VERIFICATION = 'send-verification-email'
}

/**
 * Attachment Processing Job Types
 */
export enum AttachmentJobType {
  PROCESS_IMAGE = 'process-image'
}

/**
 * Version Cleanup Job Types
 */
export enum VersionCleanupJobType {
  PRUNE_AUTO = 'prune-auto-versions'
}

/**
 * Content Publishing Job Types
 */
export enum ContentJobType {
  PUBLISH_DUE = 'publish-due-content'
}

/**
 * Audit Retention Job Types
 */
export enum AuditRetentionJobType {
  PURGE_EXPIRED = 'purge-expired-audit-logs'
}

/**
 * Account Security Job Types
 */
export enum AccountSecurityJobType {
  UNLOCK_ACCOUNT = 'unlock-account',
  RESET_FAILED_ATTEMPTS = 'reset-failed-attempts',
  CHECK_EXPIRED_LOCKS = 'check-expired-locks'
}

/**
 * Account Security Job Data Interfaces
 */
export interface UnlockAccountJobData extends BaseJobData {
  userId: string
  reason: 'AUTO_UNLOCK' | 'ADMIN_UNLOCK'
  lockedAt: Date
}

export interface ResetFailedAttemptsJobData extends BaseJobData {
  userId: string
  lastFailedAttempt: Date
}

export interface CheckExpiredLocksJobData extends BaseJobData {
  batchSize?: number
}

/**
 * Base Job Data Interface
 */
export interface BaseJobData {
  triggeredBy?: string
  reason?: string
  timestamp?: string
}
