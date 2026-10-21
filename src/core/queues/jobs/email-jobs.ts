import type { KeepJobs } from 'bullmq'

/**
 * Email Job Types and Data Interfaces
 *
 * Defines all email-related job types and their payload structures
 * for BullMQ queue processing
 */

export enum EmailJobType {
  SEND_WELCOME = 'send-welcome',
  SEND_VERIFICATION = 'send-verification',
  SEND_VERIFIED_SUCCESS = 'send-verified-success',
  SEND_PASSWORD_RESET = 'send-password-reset',
  SEND_PASSWORD_CHANGED = 'send-password-changed',
  SEND_ACCOUNT_LOCKED = 'send-account-locked',
  SEND_ACCOUNT_UNLOCKED = 'send-account-unlocked',
  SEND_CUSTOM = 'send-custom'
}

/**
 * Base email job data
 */
export interface BaseEmailJobData {
  to: string
  userName?: string
  metadata?: Record<string, unknown>
}

/**
 * Welcome email job data
 */
export interface WelcomeEmailJobData extends BaseEmailJobData {
  verificationLink: string
}

/**
 * Email verification job data
 */
export interface VerificationEmailJobData extends BaseEmailJobData {
  verificationLink: string
  expiresIn?: string
}

/**
 * Email verified success job data
 */
export interface VerifiedSuccessEmailJobData extends BaseEmailJobData {
  loginUrl: string
}

/**
 * Password reset email job data
 */
export interface PasswordResetEmailJobData extends BaseEmailJobData {
  resetLink: string
  expiresIn?: string
}

/**
 * Password changed email job data
 */
export interface PasswordChangedEmailJobData extends BaseEmailJobData {
  changeTime: Date
  ipAddress?: string
}

/** Dates are ISO strings: job data is stored as JSON */
export interface AccountLockedEmailJobData extends BaseEmailJobData {
  lockedAt: string
  lockedUntil: string
  failedAttempts: number
}

export interface AccountUnlockedEmailJobData extends BaseEmailJobData {
  unlockedAt: string
  unlockType: 'automatic' | 'manual'
  previousAttempts?: number
}

/**
 * Custom email job data
 */
export interface CustomEmailJobData extends BaseEmailJobData {
  subject: string
  html?: string
  text?: string
  template?: string
  context?: Record<string, unknown>
}

/**
 * Union type for all email job data
 */
export type EmailJobData =
  | WelcomeEmailJobData
  | VerificationEmailJobData
  | VerifiedSuccessEmailJobData
  | PasswordResetEmailJobData
  | PasswordChangedEmailJobData
  | CustomEmailJobData
  | AccountLockedEmailJobData
  | AccountUnlockedEmailJobData

/**
 * Email job options
 */
export interface EmailJobOptions {
  priority?: number
  delay?: number
  attempts?: number
  backoff?: {
    type: 'exponential' | 'fixed'
    delay: number
  }
  removeOnComplete?: boolean | number | KeepJobs
  removeOnFail?: boolean | number | KeepJobs
}

/**
 * Default email job options
 */
export const DEFAULT_EMAIL_JOB_OPTIONS: EmailJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000 // 5 seconds base delay
  },
  // Email jobs carry live reset and verification links: keep them only briefly. A sent
  // job stays 10 minutes so a re-dispatched outbox message (same job id) is still
  // recognized and not sent twice; a failed one stays a day for inspection (the
  // dead-letter copy has the links redacted).
  removeOnComplete: { age: 10 * 60 },
  removeOnFail: { age: 24 * 60 * 60 }
}
