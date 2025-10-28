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
  SEND_CUSTOM = 'send-custom',
}

/**
 * Base email job data
 */
export interface BaseEmailJobData {
  to: string;
  userName?: string;
  metadata?: Record<string, any>;
}

/**
 * Welcome email job data
 */
export interface WelcomeEmailJobData extends BaseEmailJobData {
  verificationLink: string;
}

/**
 * Email verification job data
 */
export interface VerificationEmailJobData extends BaseEmailJobData {
  verificationLink: string;
  expiresIn?: string;
}

/**
 * Email verified success job data
 */
export interface VerifiedSuccessEmailJobData extends BaseEmailJobData {
  loginUrl: string;
}

/**
 * Password reset email job data
 */
export interface PasswordResetEmailJobData extends BaseEmailJobData {
  resetLink: string;
  expiresIn?: string;
}

/**
 * Password changed email job data
 */
export interface PasswordChangedEmailJobData extends BaseEmailJobData {
  changeTime: Date;
  ipAddress?: string;
}

/**
 * Custom email job data
 */
export interface CustomEmailJobData extends BaseEmailJobData {
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  context?: Record<string, any>;
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
  | CustomEmailJobData;

/**
 * Email job options
 */
export interface EmailJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

/**
 * Default email job options
 */
export const DEFAULT_EMAIL_JOB_OPTIONS: EmailJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5 seconds base delay
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 500, // Keep last 500 failed jobs for debugging
};
