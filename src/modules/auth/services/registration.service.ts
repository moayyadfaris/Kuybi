import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EntityManager } from 'typeorm'

import { RoleRepository } from '@modules/acl'
import { EmailVerificationRepository, UserRepository } from '@modules/users'
import { EmailVerification, User } from '@modules/users/entities'

import { hashTokenSecret, PasswordHasher } from '@core/security'

import { RegisterUserDto } from '../dto/register.dto'

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Sign-up and email verification. A new account can sign in at once; verifying the
 * email (a single-use link, valid 24 hours, stored hashed) marks it verified.
 */
@Injectable()
export class RegistrationService {
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
    this.appUrl = this.configService.get<string>('app.url', 'http://localhost:4040')
  }

  /** Creates the account with the default role and emails the verification link */
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

    const newUser: Partial<User> = {
      email,
      passwordHash: await this.passwordHasher.hash(password),
      name: `${firstName} ${lastName}`,
      mobileNumber: phoneNumber || null,
      isActive: true,
      isVerified: false,
      isEmailVerified: false,
      emailVerifiedAt: null,
      primaryRoleId: await this.roleRepository.findDefaultRoleId()
    }

    // User, verification token and welcome email commit together: a user can no longer
    // end up without a token, or receive an email for a registration that rolled back
    const savedUser = await this.userRepository.transaction(async manager => {
      const savedUser = await manager.save(manager.create(User, newUser))
      const link = await this.storeVerificationToken(manager, savedUser)
      await this.emailQueueService.queueWelcomeEmail(savedUser.email, firstName, link, {
        priority: 1,
        manager
      })
      return savedUser
    })

    this.logger.info({ userId: savedUser.id }, 'User registered')
    return savedUser
  }

  /**
   * Marks the email verified. The token is claimed with a conditional update, so of two
   * concurrent clicks only one verifies (and sends the confirmation email).
   */
  async verifyEmail(token: string): Promise<User> {
    const record = await this.emailVerificationRepository.findByToken(token)

    if (!record) {
      throw new BadRequestException(
        'Invalid verification token. Please request a new verification email.'
      )
    }
    if (record.isExpired()) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new verification email.'
      )
    }
    if (record.verified || record.user.isEmailVerified) {
      throw new BadRequestException('Email is already verified')
    }

    const user = record.user
    const now = new Date()

    await this.userRepository.transaction(
      async manager => {
        const claim = await manager.update(
          EmailVerification,
          { id: record.id, verified: false },
          { verified: true, verifiedAt: now }
        )
        if (!claim.affected) {
          throw new BadRequestException('Email is already verified')
        }
        await manager.update(User, user.id, {
          isEmailVerified: true,
          emailVerifiedAt: now,
          isVerified: true
        })
        await this.emailQueueService.queueVerifiedSuccessEmail(
          user.email,
          firstNameOf(user),
          `${this.appUrl}/login`,
          { priority: 1, manager }
        )
      },
      { touched: [user.id] }
    )

    this.logger.info({ userId: user.id, tokenId: record.id }, 'Email verified')
    return { ...user, isEmailVerified: true, emailVerifiedAt: now, isVerified: true } as User
  }

  /**
   * Emails a new verification link (earlier ones stop working). Does nothing, silently,
   * for an unknown or already verified email: the answer must not reveal accounts.
   */
  async resendVerification(email: string, ipAddress?: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email.trim(), true)
    if (!user || user.isEmailVerified) {
      this.logger.info(
        { ipAddress, action: 'resend_verification_skipped' },
        'Verification resend for an unknown or already verified email'
      )
      return
    }

    // Old tokens expire, the new one is stored and its email queued, all or nothing
    await this.userRepository.transaction(async manager => {
      await manager.update(
        EmailVerification,
        { userId: user.id, verified: false },
        { expiresAt: new Date() }
      )
      const link = await this.storeVerificationToken(manager, user)
      await this.emailQueueService.queueVerificationEmail(
        user.email,
        firstNameOf(user),
        link,
        '24 hours',
        { priority: 2, manager }
      )
    })

    this.logger.info({ userId: user.id, ipAddress }, 'Verification email resent')
  }

  /**
   * Stores a new verification token (hashed) for the user
   * @returns the link to email: the frontend page that posts the token to /verify-email
   */
  private async storeVerificationToken(manager: EntityManager, user: User): Promise<string> {
    const token = randomUUID()
    await manager.save(
      manager.create(EmailVerification, {
        userId: user.id,
        email: user.email,
        token: hashTokenSecret(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
        verified: false,
        verifiedAt: null,
        ipAddress: null,
        userAgent: null
      })
    )
    return `${this.appUrl}/verify-email?token=${token}`
  }
}

const firstNameOf = (user: Pick<User, 'name'>) => user.name.split(' ')[0] || 'there'
