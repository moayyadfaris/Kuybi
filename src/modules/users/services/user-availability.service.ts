import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { User } from '../entities/user.entity'
import { CacheService } from '@core/cache/services/cache.service'

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
 * - Email availability check with caching
 * - Phone availability check with caching
 * - Username suggestions if not available
 * - Fast lookup with Redis caching (1-hour TTL)
 */
@Injectable()
export class UserAvailabilityService {
  private readonly CACHE_TTL = 3600 // 1 hour
  private readonly CACHE_PREFIX = 'user:availability'

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cacheService: CacheService,
    @InjectPinoLogger(UserAvailabilityService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Check if email is available for registration
   */
  async isEmailAvailable(email: string): Promise<AvailabilityCheckResult> {
    const normalizedEmail = email.toLowerCase().trim()
    const cacheKey = `${this.CACHE_PREFIX}:email:${normalizedEmail}`

    // Try cache first
    const cached = await this.cacheService.get<boolean>(cacheKey)
    if (cached !== null) {
      this.logger.debug(
        { email: normalizedEmail, cached: true },
        'Email availability check (cached)'
      )
      return {
        available: cached,
        field: 'email',
        value: normalizedEmail,
        suggestions: cached ? undefined : this.generateEmailSuggestions(normalizedEmail)
      }
    }

    // Check database
    const exists = await this.userRepository.exists({
      where: { email: normalizedEmail }
    })

    const available = !exists

    // Cache result
    await this.cacheService.set(cacheKey, available, this.CACHE_TTL)

    this.logger.info(
      { email: normalizedEmail, available, cached: false },
      'Email availability check (database)'
    )

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
    const cacheKey = `${this.CACHE_PREFIX}:phone:${normalizedPhone}`

    // Try cache first
    const cached = await this.cacheService.get<boolean>(cacheKey)
    if (cached !== null) {
      this.logger.debug(
        { phone: normalizedPhone, cached: true },
        'Phone availability check (cached)'
      )
      return {
        available: cached,
        field: 'phone',
        value: normalizedPhone
      }
    }

    // Check database
    const exists = await this.userRepository.exists({
      where: { mobileNumber: normalizedPhone }
    })

    const available = !exists

    // Cache result
    await this.cacheService.set(cacheKey, available, this.CACHE_TTL)

    this.logger.info(
      { phone: normalizedPhone, available, cached: false },
      'Phone availability check (database)'
    )

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
    return phone.replace(/[\s\-\(\)]/g, '')
  }

  /**
   * Invalidate cache when user is created/updated
   */
  async invalidateCache(email?: string, phone?: string): Promise<void> {
    const keys: string[] = []

    if (email) {
      const normalizedEmail = email.toLowerCase().trim()
      keys.push(`${this.CACHE_PREFIX}:email:${normalizedEmail}`)
    }

    if (phone) {
      const normalizedPhone = this.normalizePhone(phone)
      keys.push(`${this.CACHE_PREFIX}:phone:${normalizedPhone}`)
    }

    if (keys.length > 0) {
      await Promise.all(keys.map(key => this.cacheService.del(key)))
      this.logger.debug({ keys }, 'Invalidated availability cache')
    }
  }
}
