import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { RoleRepository } from '@modules/acl'
import { EmailVerificationRepository, UserRepository } from '@modules/users'
import { EmailVerification, User } from '@modules/users/entities'

import { PasswordHasher } from '@core/security'

import { RegisterUserDto } from '../dto/register.dto'

/**
 * Registration Service
 *
 * Handles user registration, email verification, and related operations
 */
@Injectable()
export class RegistrationService {
  private readonly verificationTokenExpiry: number
  private readonly appUrl: string

  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository,
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly roleRepository: RoleRepository,
    private readonly emailQueueService: EmailQueueService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(RegistrationService.name)
    private readonly logger: PinoLogger
  ) {
    // 24 hours in milliseconds
    this.verificationTokenExpiry = 24 * 60 * 60 * 1000
    this.appUrl = this.configService.get<string>('app.url', 'http://localhost:4040')
  }

  /**
   * Register a new user
   */
  async register(registerDto: RegisterUserDto): Promise<User> {
    const { password, firstName, lastName, phoneNumber } = registerDto
    // Login looks emails up lowercased and the column is case-sensitive: an account
    // stored as "John@x.com" could never log in
    const email = registerDto.email.trim().toLowerCase()

    if (await this.userRepository.isEmailTaken(email)) {
      throw new ConflictException('Email already registered')
    }
    if (phoneNumber && (await this.userRepository.isMobileTaken(phoneNumber))) {
      throw new ConflictException('Phone number already registered')
    }

    // Hash password
    const passwordHash = await this.passwordHasher.hash(password)

    // Generate email verification token
    const emailVerificationToken = randomUUID()
    const emailVerificationExpiry = new Date(Date.now() + this.verificationTokenExpiry)

    const newUser: Partial<User> = {
      email,
      passwordHash,
      name: `${firstName} ${lastName}`,
      mobileNumber: phoneNumber || '',
      isActive: true,
      isVerified: false,
      isEmailVerified: false,
      emailVerifiedAt: null,
      primaryRoleId: await this.roleRepository.findDefaultRoleId()
    }

    const verificationLink = `${this.appUrl}/api/v1/auth/verify-email?token=${emailVerificationToken}`

    // User, verification token and welcome email commit together: a user can no longer
    // end up without a token, or receive an email for a registration that rolled back
    const { savedUser, emailVerificationRecord } = await this.userRepository.transaction(
      async manager => {
        const savedUser = await manager.save(manager.create(User, newUser))
        const emailVerificationRecord = await manager.save(
          manager.create(EmailVerification, {
            userId: savedUser.id,
            email: savedUser.email,
            token: emailVerificationToken,
            expiresAt: emailVerificationExpiry,
            verified: false,
            verifiedAt: null,
            ipAddress: null, // Can be passed from controller if needed
            userAgent: null
          })
        )
        await this.emailQueueService.queueWelcomeEmail(
          savedUser.email,
          firstName,
          verificationLink,
          {
            priority: 1, // High priority for welcome emails
            manager
          }
        )
        return { savedUser, emailVerificationRecord }
      }
    )

    this.logger.info(
      {
        userId: savedUser.id,
        email: savedUser.email,
        tokenId: emailVerificationRecord.id,
        tokenExpiry: emailVerificationExpiry
      },
      'User registered successfully, verification token stored in database'
    )

    return savedUser
  }

  /**
   * Verify user email
   */
  async verifyEmail(token: string): Promise<User> {
    this.logger.info({ token: token.substring(0, 8) + '...' }, 'Email verification requested')

    // Find verification record in database
    const verificationRecord = await this.emailVerificationRepository.findByToken(token)

    if (!verificationRecord) {
      this.logger.warn({ token: token.substring(0, 8) + '...' }, 'Verification token not found')
      throw new BadRequestException(
        'Invalid verification token. Please request a new verification email.'
      )
    }

    // Check if token is expired
    if (verificationRecord.isExpired()) {
      this.logger.warn(
        {
          tokenId: verificationRecord.id,
          expiresAt: verificationRecord.expiresAt
        },
        'Verification token expired'
      )
      throw new BadRequestException(
        'Verification token has expired. Please request a new verification email.'
      )
    }

    // Check if already verified
    if (verificationRecord.verified) {
      this.logger.info({ tokenId: verificationRecord.id }, 'Token already used')
      throw new BadRequestException('Email is already verified')
    }

    const user = verificationRecord.user

    // Check if user's email is already verified (could be verified via another token)
    if (user.isEmailVerified) {
      this.logger.info({ userId: user.id, email: user.email }, 'Email already verified')
      throw new BadRequestException('Email is already verified')
    }

    // Update verification record
    verificationRecord.verified = true
    verificationRecord.verifiedAt = new Date()

    // Update user verification status
    user.isEmailVerified = true
    user.emailVerifiedAt = new Date()
    user.isVerified = true // Mark user as fully verified

    // Get first name for success email
    const firstName = user.name.split(' ')[0]
    const loginUrl = `${this.appUrl}/login`

    // Token, user and confirmation email commit together
    const updatedUser = await this.userRepository.transaction(async manager => {
      await manager.save(verificationRecord)
      const updatedUser = await manager.save(user)
      await this.emailQueueService.queueVerifiedSuccessEmail(user.email, firstName, loginUrl, {
        priority: 1, // High priority
        manager
      })
      return updatedUser
    })

    this.logger.info(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        verifiedAt: updatedUser.emailVerifiedAt,
        tokenId: verificationRecord.id
      },
      'Email verified successfully'
    )

    return updatedUser
  }

  /**
   * Resend verification email
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email.trim(), true)

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified')
    }

    // Generate new verification token
    const emailVerificationToken = randomUUID()
    const emailVerificationExpiry = new Date(Date.now() + this.verificationTokenExpiry)

    const verificationLink = `${this.appUrl}/api/v1/auth/verify-email?token=${emailVerificationToken}`

    // Get first name from full name
    const firstName = user.name.split(' ')[0]

    // Old tokens expire, the new one is stored and its email queued, all or nothing
    const emailVerificationRecord = await this.userRepository.transaction(async manager => {
      await manager.update(
        EmailVerification,
        { userId: user.id, verified: false },
        { expiresAt: new Date() } // Expire immediately
      )
      const emailVerificationRecord = await manager.save(
        manager.create(EmailVerification, {
          userId: user.id,
          email: user.email,
          token: emailVerificationToken,
          expiresAt: emailVerificationExpiry,
          verified: false,
          verifiedAt: null,
          ipAddress: null,
          userAgent: null
        })
      )
      await this.emailQueueService.queueVerificationEmail(
        user.email,
        firstName,
        verificationLink,
        '24 hours',
        { priority: 2, manager } // Medium-high priority
      )
      return emailVerificationRecord
    })

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        tokenId: emailVerificationRecord.id,
        tokenExpiry: emailVerificationExpiry
      },
      'Verification email resent, new token stored in database'
    )
  }
}
