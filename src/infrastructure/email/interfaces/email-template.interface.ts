export enum EmailTemplate {
  WELCOME = 'welcome',
  EMAIL_VERIFICATION = 'verification',
  EMAIL_VERIFIED_SUCCESS = 'verified-success',
  PASSWORD_RESET = 'password-reset',
  PASSWORD_CHANGED = 'password-changed'
}

export interface EmailTemplateContext {
  // Common fields
  appName?: string
  appUrl?: string
  supportEmail?: string
  securityEmail?: string
  year?: number

  // User-specific
  userName?: string
  userEmail?: string

  // Action-specific
  verificationLink?: string
  verificationCode?: string
  expiresIn?: string
  resetLink?: string
  loginUrl?: string
  changeTime?: string
  ipAddress?: string

  // Additional context
  [key: string]: any
}

export interface EmailOptions {
  to: string
  subject: string
  template: EmailTemplate
  context: EmailTemplateContext
  from?: string
}
