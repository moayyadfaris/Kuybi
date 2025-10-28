import * as validator from 'validator'

/**
 * Phone Validation Utilities
 * 
 * Provides phone number validation and formatting
 */

/**
 * Validate phone number format (international format)
 */
export function isValidPhone(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')

  // Check if it's a valid mobile phone
  // Supports international format with country code
  return validator.isMobilePhone(phone, 'any', { strictMode: false })
}

/**
 * Normalize phone number (remove spaces, dashes, parentheses)
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '')
}

/**
 * Validate phone for registration
 */
export function validatePhoneForRegistration(phone: string): {
  valid: boolean
  reason?: string
} {
  if (!phone) {
    return { valid: false, reason: 'Phone number is required' }
  }

  const normalized = normalizePhone(phone)

  // Check minimum length (international format: +[country code][number])
  if (normalized.length < 10) {
    return { valid: false, reason: 'Phone number is too short' }
  }

  if (normalized.length > 15) {
    return { valid: false, reason: 'Phone number is too long' }
  }

  if (!isValidPhone(phone)) {
    return { valid: false, reason: 'Invalid phone number format' }
  }

  return { valid: true }
}

/**
 * Format phone for display (optional)
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone)
  
  // If starts with country code, format as: +X (XXX) XXX-XXXX
  if (normalized.startsWith('+')) {
    const match = normalized.match(/^\+(\d{1,3})(\d{3})(\d{3})(\d{4})$/)
    if (match) {
      return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`
    }
  }

  return phone // Return original if can't format
}
