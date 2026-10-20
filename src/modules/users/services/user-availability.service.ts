import { Injectable } from '@nestjs/common'

import { UserRepository } from '../repositories/user.repository'

export interface AvailabilityCheckResult {
  available: boolean
  field: 'email' | 'phone'
  value: string
  suggestions?: string[]
}

/**
 * Sign-up form checks: is this email or phone number free? Cached in UserRepository (any
 * user write clears it). Reveals whether an email is registered, by design; the endpoint
 * is throttled.
 */
@Injectable()
export class UserAvailabilityService {
  constructor(private readonly userRepository: UserRepository) {}

  async isEmailAvailable(email: string): Promise<AvailabilityCheckResult> {
    const normalizedEmail = email.toLowerCase().trim()
    const available = !(await this.userRepository.isEmailTaken(normalizedEmail))

    return {
      available,
      field: 'email',
      value: normalizedEmail,
      suggestions: available ? undefined : this.generateEmailSuggestions(normalizedEmail)
    }
  }

  async isPhoneAvailable(phone: string): Promise<AvailabilityCheckResult> {
    const normalizedPhone = this.normalizePhone(phone)
    const available = !(await this.userRepository.isMobileTaken(normalizedPhone))

    return {
      available,
      field: 'phone',
      value: normalizedPhone
    }
  }

  /** Variations of a taken address (not checked for availability themselves) */
  private generateEmailSuggestions(email: string): string[] {
    const [username, domain] = email.split('@')
    if (!username || !domain) return []

    const suggestions: string[] = []
    const timestamp = Date.now().toString().slice(-4)

    // Add numeric suffixes
    suggestions.push(`${username}1@${domain}`)
    suggestions.push(`${username}${timestamp}@${domain}`)
    suggestions.push(`${username}.${timestamp.slice(0, 2)}@${domain}`)

    return suggestions.slice(0, 3) // Return top 3 suggestions
  }

  /** Without spaces, dashes and parentheses */
  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '')
  }
}
