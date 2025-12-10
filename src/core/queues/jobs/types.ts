/**
 * Queue Names - Central registry of all queues in the application
 */
export enum QueueName {
  SESSION_CLEANUP = 'session-cleanup-queue',
  LOG_MAINTENANCE = 'log-maintenance-queue',
  EMAIL = 'email-queue',
  SMS = 'sms-queue',
  ATTACHMENT_PROCESSING = 'attachment-processing-queue',
  NOTIFICATION = 'notification-queue',
  SECURITY_SCAN = 'security-scan-queue',
  DATA_EXPORT = 'data-export-queue',
  REPORT_GENERATION = 'report-generation-queue',
  VERSION_CLEANUP = 'version-cleanup-queue',
  ACCOUNT_SECURITY = 'account-security-queue',
  DEAD_LETTER = 'dead-letter-queue'
}

/**
 * Session Cleanup Job Types
 */
export enum SessionCleanupJobType {
  CLEANUP_EXPIRED = 'cleanup-expired-sessions',
  CHECK_EXPIRING = 'check-expiring-sessions',
  CHECK_SUSPICIOUS = 'check-suspicious-sessions',
  REMOVE_ORPHANED = 'remove-orphaned-sessions'
}

/**
 * Log Maintenance Job Types
 */
export enum LogMaintenanceJobType {
  ROTATE_LOGS = 'rotate-logs',
  CLEANUP_ARCHIVES = 'cleanup-archives',
  SHIP_LOGS = 'ship-logs-remote',
  CHECK_SIZE = 'check-log-size'
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
 * SMS Job Types
 */
export enum SMSJobType {
  SEND_OTP = 'send-otp-sms',
  SEND_NOTIFICATION = 'send-notification-sms',
  SEND_ALERT = 'send-alert-sms'
}

/**
 * Attachment Processing Job Types
 */
export enum AttachmentJobType {
  PROCESS_IMAGE = 'process-image',
  GENERATE_THUMBNAILS = 'generate-thumbnails',
  VIRUS_SCAN = 'virus-scan',
  CLEANUP_ORPHANED = 'cleanup-orphaned-files',
  EXTRACT_METADATA = 'extract-metadata',
  OPTIMIZE_IMAGE = 'optimize-image',
  CONVERT_FORMAT = 'convert-format'
}

/**
 * Notification Job Types
 */
export enum NotificationJobType {
  PUSH_NOTIFICATION = 'push-notification',
  IN_APP_NOTIFICATION = 'in-app-notification',
  BROADCAST = 'broadcast-notification'
}

/**
 * Version Cleanup Job Types
 */
export enum VersionCleanupJobType {
  CLEANUP_EXPIRED = 'cleanup-expired-versions',
  ARCHIVE_OLD = 'archive-old-versions',
  MANUAL_CLEANUP = 'manual-cleanup-versions'
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

/**
 * Job Priority Levels
 */
export enum JobPriority {
  CRITICAL = 1,
  HIGH = 3,
  MEDIUM = 5,
  LOW = 7,
  BACKGROUND = 10
}
