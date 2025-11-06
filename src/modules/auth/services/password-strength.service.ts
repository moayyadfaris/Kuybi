import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as crypto from 'crypto'

export interface PasswordStrengthResult {
  score: number // 0-4 (0: very weak, 4: very strong)
  strength: 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong'
  feedback: string[]
  passed: boolean
  isBreached?: boolean
  requirements: {
    minLength: boolean
    hasUppercase: boolean
    hasLowercase: boolean
    hasNumber: boolean
    hasSpecialChar: boolean
  }
}

@Injectable()
export class PasswordStrengthService {
  private readonly MIN_LENGTH = 8
  private readonly MIN_SCORE_TO_PASS = 2 // Fair or better

  constructor(
    @InjectPinoLogger(PasswordStrengthService.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService
  ) {}

  /**
   * Calculate password strength and provide feedback
   */
  async calculateStrength(password: string): Promise<PasswordStrengthResult> {
    const requirements = {
      minLength: password.length >= this.MIN_LENGTH,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    }

    // Calculate base score (0-4)
    let score = 0
    const feedback: string[] = []

    // Length scoring
    if (password.length >= 16) {
      score += 2
    } else if (password.length >= 12) {
      score += 1.5
    } else if (password.length >= 8) {
      score += 1
    } else {
      feedback.push(`Password must be at least ${this.MIN_LENGTH} characters long`)
    }

    // Character variety scoring
    if (requirements.hasUppercase) score += 0.5
    else feedback.push('Add uppercase letters (A-Z)')

    if (requirements.hasLowercase) score += 0.5
    else feedback.push('Add lowercase letters (a-z)')

    if (requirements.hasNumber) score += 0.5
    else feedback.push('Add numbers (0-9)')

    if (requirements.hasSpecialChar) score += 0.5
    else feedback.push('Add special characters (!@#$%^&*)')

    // Additional complexity checks
    if (this.hasRepeatingCharacters(password)) {
      score -= 0.5
      feedback.push('Avoid repeating characters (e.g., "aaa", "111")')
    }

    if (this.hasSequentialCharacters(password)) {
      score -= 0.5
      feedback.push('Avoid sequential characters (e.g., "abc", "123")')
    }

    if (this.isCommonPassword(password)) {
      score = 0
      feedback.push('This is a commonly used password. Choose something unique.')
    }

    // Clamp score between 0-4
    score = Math.max(0, Math.min(4, Math.round(score)))

    const strength = this.getStrengthLabel(score)
    const passed = score >= this.MIN_SCORE_TO_PASS

    // Check for breached passwords (placeholder for now)
    const isBreached = await this.checkIfBreached(password)
    if (isBreached) {
      feedback.unshift(
        '⚠️ This password has been exposed in a data breach. Choose a different one.'
      )
    }

    const result: PasswordStrengthResult = {
      score,
      strength,
      feedback,
      passed: passed && !isBreached,
      isBreached,
      requirements
    }

    this.logger.debug(
      {
        score,
        strength,
        passed: result.passed,
        isBreached,
        length: password.length
      },
      'Password strength calculated'
    )

    return result
  }

  /**
   * Get strength label from score
   */
  private getStrengthLabel(
    score: number
  ): 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong' {
    if (score === 0) return 'very-weak'
    if (score === 1) return 'weak'
    if (score === 2) return 'fair'
    if (score === 3) return 'strong'
    return 'very-strong'
  }

  /**
   * Check for repeating characters (e.g., "aaa", "111")
   */
  private hasRepeatingCharacters(password: string): boolean {
    return /(.)\1{2,}/.test(password)
  }

  /**
   * Check for sequential characters (e.g., "abc", "123")
   */
  private hasSequentialCharacters(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm'
    ]

    const lowerPassword = password.toLowerCase()

    for (const sequence of sequences) {
      for (let i = 0; i < sequence.length - 2; i++) {
        const seq = sequence.substring(i, i + 3)
        const reverseSeq = seq.split('').reverse().join('')

        if (lowerPassword.includes(seq) || lowerPassword.includes(reverseSeq)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if password is in common password list
   */
  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password',
      'password123',
      '12345678',
      'qwerty',
      'abc123',
      'monkey',
      '1234567',
      'letmein',
      'trustno1',
      'dragon',
      'baseball',
      'iloveyou',
      'master',
      'sunshine',
      'ashley',
      'bailey',
      'passw0rd',
      'shadow',
      '123123',
      '654321',
      'superman',
      'qazwsx',
      'michael',
      'football',
      'welcome',
      'jesus',
      'ninja',
      'mustang',
      'password1',
      'admin',
      'welcome123',
      'hello',
      'freedom',
      'whatever',
      'charlie'
    ]

    return commonPasswords.includes(password.toLowerCase())
  }

  /**
   * Check if password has been breached using HaveIBeenPwned API
   * Uses k-anonymity model - only sends first 5 chars of hash
   */
  private async checkIfBreached(password: string): Promise<boolean> {
    const enabled = this.configService.get<boolean>('auth.enableBreachDetection', true)

    if (!enabled) {
      this.logger.debug('Breach detection disabled via configuration')
      return false
    }

    try {
      // Hash password with SHA-1
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase()
      const prefix = hash.substring(0, 5)
      const suffix = hash.substring(5)

      this.logger.debug({ prefix }, 'Checking password breach with k-anonymity')

      // Query HaveIBeenPwned API with k-anonymity
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: {
          'User-Agent': 'Kuybi-Password-Checker',
          'Add-Padding': 'true' // HIBP recommends this for additional privacy
        }
      })

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, statusText: response.statusText },
          'Failed to check password breach - HIBP API error'
        )
        // Fail open - don't block user if API is down
        return false
      }

      const data = await response.text()
      const hashes = data.split('\n')

      // Check if our hash suffix appears in the list
      const found = hashes.some(line => {
        const [hashSuffix] = line.split(':')
        return hashSuffix === suffix
      })

      if (found) {
        this.logger.warn(
          { hashPrefix: prefix },
          'Password found in breach database - user should choose different password'
        )
      } else {
        this.logger.debug('Password not found in breach database')
      }

      return found
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error checking password breach - failing open')
      // Fail open - don't block user if there's an error
      return false
    }
  }

  /**
   * Validate password meets minimum requirements
   */
  async validatePassword(password: string): Promise<{ valid: boolean; errors: string[] }> {
    const result = await this.calculateStrength(password)

    return {
      valid: result.passed,
      errors: result.passed ? [] : result.feedback
    }
  }
}
