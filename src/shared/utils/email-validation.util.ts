import * as validator from 'validator'

/**
 * Email Validation Utilities
 * 
 * Provides email validation and domain filtering
 */

// List of disposable/temporary email domains to block
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'throwaway.email',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  'trashmail.com',
  'temp-mail.org',
  'fakeinbox.com',
  'yopmail.com',
  'getnada.com',
]

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return validator.isEmail(email)
}

/**
 * Check if email domain is disposable/temporary
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false

  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false

  return DISPOSABLE_EMAIL_DOMAINS.includes(domain)
}

/**
 * Validate email and check against disposable domains
 */
export function validateEmailForRegistration(email: string): {
  valid: boolean
  reason?: string
} {
  if (!email) {
    return { valid: false, reason: 'Email is required' }
  }

  if (!isValidEmail(email)) {
    return { valid: false, reason: 'Invalid email format' }
  }

  if (isDisposableEmail(email)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed' }
  }

  return { valid: true }
}

/**
 * Normalize email (lowercase, trim)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}
