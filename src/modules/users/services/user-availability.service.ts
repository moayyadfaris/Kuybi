import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UserRepository } from '../repositories/user.repository'

export interface AvailabilityCheckResult {
  available: boolean
  field: 'email' | 'phone'
  value: string
  suggestions?: string[]
}

/**
 * User Availability Service
 *
 * Checks if email or phone number is already in use
 *
 * Features:
 * - Email and phone availability (cached in UserRepository; any user write clears it)
 * - Email suggestions if not available
 */
@Injectable()
export class UserAvailabilityService {
  constructor(
    private readonly userRepository: UserRepository,
    @InjectPinoLogger(UserAvailabilityService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Check if email is available for registration
   */
  async isEmailAvailable(email: string): Promise<AvailabilityCheckResult> {
    const normalizedEmail = email.toLowerCase().trim()
    const available = !(await this.userRepository.isEmailTaken(normalizedEmail))

    this.logger.debug({ email: normalizedEmail, available }, 'Email availability check')

    return {
      available,
      field: 'email',
      value: normalizedEmail,
      suggestions: available ? undefined : this.generateEmailSuggestions(normalizedEmail)
    }
  }

  /**
   * Check if phone number is available for registration
   */
  async isPhoneAvailable(phone: string): Promise<AvailabilityCheckResult> {
    const normalizedPhone = this.normalizePhone(phone)
    const available = !(await this.userRepository.isMobileTaken(normalizedPhone))

    this.logger.debug({ phone: normalizedPhone, available }, 'Phone availability check')

    return {
      available,
      field: 'phone',
      value: normalizedPhone
    }
  }

  /**
   * Generate email suggestions if email is not available
   */
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

  /**
   * Normalize phone number (remove spaces, dashes, etc.)
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '')
  }
}
