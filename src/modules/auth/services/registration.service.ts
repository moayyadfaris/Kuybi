import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../users/entities/user.entity';
import { EmailVerification } from '../../users/entities/email-verification.entity';
import { RegisterUserDto } from '../dto/register.dto';
import { EmailQueueService } from '@infrastructure/email';
import { ConfigService } from '@nestjs/config';

/**
 * Registration Service
 * 
 * Handles user registration, email verification, and related operations
 */
@Injectable()
export class RegistrationService {
  private readonly verificationTokenExpiry: number;
  private readonly appUrl: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailVerification)
    private readonly emailVerificationRepository: Repository<EmailVerification>,
    private readonly emailQueueService: EmailQueueService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(RegistrationService.name)
    private readonly logger: PinoLogger,
  ) {
    // 24 hours in milliseconds
    this.verificationTokenExpiry = 24 * 60 * 60 * 1000;
    this.appUrl = this.configService.get<string>('app.url', 'http://localhost:4040');
  }

  /**
   * Register a new user
   */
  async register(registerDto: RegisterUserDto): Promise<User> {
    const { email, password, firstName, lastName, phoneNumber } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [{ email }, ...(phoneNumber ? [{ mobileNumber: phoneNumber }] : [])],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already registered');
      }
      if (phoneNumber && existingUser.mobileNumber === phoneNumber) {
        throw new ConflictException('Phone number already registered');
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate email verification token
    const emailVerificationToken = uuidv4();
    const emailVerificationExpiry = new Date(Date.now() + this.verificationTokenExpiry);

    // Create user
    const user = this.userRepository.create({
      email,
      passwordHash,
      name: `${firstName} ${lastName}`,
      mobileNumber: phoneNumber || '',
      isActive: true,
      isVerified: false,
      isEmailVerified: false,
      emailVerifiedAt: null,
      role: 'ROLE_USER',
      // Store verification token temporarily (we'll need to add these columns)
      // For now, we'll send the email and mark as pending verification
    });

    const savedUser = await this.userRepository.save(user);

    // Store verification token in database
    const emailVerificationRecord = this.emailVerificationRepository.create({
      userId: savedUser.id,
      email: savedUser.email,
      token: emailVerificationToken,
      expiresAt: emailVerificationExpiry,
      verified: false,
      verifiedAt: null,
      ipAddress: null, // Can be passed from controller if needed
      userAgent: null,
    });

    await this.emailVerificationRepository.save(emailVerificationRecord);

    // Generate verification link
    const verificationLink = `${this.appUrl}/api/v1/auth/verify-email?token=${emailVerificationToken}`;

    // Queue welcome email with verification link
    await this.emailQueueService.queueWelcomeEmail(
      user.email,
      firstName,
      verificationLink,
      { priority: 1 }, // High priority for welcome emails
    );

    this.logger.info(
      {
        userId: savedUser.id,
        email: savedUser.email,
        tokenId: emailVerificationRecord.id,
        tokenExpiry: emailVerificationExpiry,
      },
      'User registered successfully, verification token stored in database',
    );

    return savedUser;
  }

  /**
   * Verify user email
   */
  async verifyEmail(token: string): Promise<User> {
    this.logger.info(
      { token: token.substring(0, 8) + '...' },
      'Email verification requested',
    );

    // Find verification record in database
    const verificationRecord = await this.emailVerificationRepository.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!verificationRecord) {
      this.logger.warn({ token: token.substring(0, 8) + '...' }, 'Verification token not found');
      throw new BadRequestException(
        'Invalid verification token. Please request a new verification email.',
      );
    }

    // Check if token is expired
    if (verificationRecord.isExpired()) {
      this.logger.warn(
        {
          tokenId: verificationRecord.id,
          expiresAt: verificationRecord.expiresAt,
        },
        'Verification token expired',
      );
      throw new BadRequestException(
        'Verification token has expired. Please request a new verification email.',
      );
    }

    // Check if already verified
    if (verificationRecord.verified) {
      this.logger.info({ tokenId: verificationRecord.id }, 'Token already used');
      throw new BadRequestException('Email is already verified');
    }

    const user = verificationRecord.user;

    // Check if user's email is already verified (could be verified via another token)
    if (user.isEmailVerified) {
      this.logger.info({ userId: user.id, email: user.email }, 'Email already verified');
      throw new BadRequestException('Email is already verified');
    }

    // Update verification record
    verificationRecord.verified = true;
    verificationRecord.verifiedAt = new Date();
    await this.emailVerificationRepository.save(verificationRecord);

    // Update user verification status
    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    user.isVerified = true; // Mark user as fully verified

    const updatedUser = await this.userRepository.save(user);

    // Get first name for success email
    const firstName = user.name.split(' ')[0];
    const loginUrl = `${this.appUrl}/login`;

    // Queue success email
    await this.emailQueueService.queueVerifiedSuccessEmail(
      user.email,
      firstName,
      loginUrl,
      { priority: 1 }, // High priority
    );

    this.logger.info(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        verifiedAt: updatedUser.emailVerifiedAt,
        tokenId: verificationRecord.id,
      },
      'Email verified successfully',
    );

    return updatedUser;
  }

  /**
   * Resend verification email
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new verification token
    const emailVerificationToken = uuidv4();
    const emailVerificationExpiry = new Date(Date.now() + this.verificationTokenExpiry);

    // Invalidate any existing unverified tokens for this user
    await this.emailVerificationRepository.update(
      {
        userId: user.id,
        verified: false,
      },
      {
        expiresAt: new Date(), // Expire immediately
      },
    );

    // Create new verification record
    const emailVerificationRecord = this.emailVerificationRepository.create({
      userId: user.id,
      email: user.email,
      token: emailVerificationToken,
      expiresAt: emailVerificationExpiry,
      verified: false,
      verifiedAt: null,
      ipAddress: null,
      userAgent: null,
    });

    await this.emailVerificationRepository.save(emailVerificationRecord);

    const verificationLink = `${this.appUrl}/api/v1/auth/verify-email?token=${emailVerificationToken}`;

    // Get first name from full name
    const firstName = user.name.split(' ')[0];

    // Queue verification email
    await this.emailQueueService.queueVerificationEmail(
      user.email,
      firstName,
      verificationLink,
      '24 hours',
      { priority: 2 }, // Medium-high priority
    );

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        tokenId: emailVerificationRecord.id,
        tokenExpiry: emailVerificationExpiry,
      },
      'Verification email resent, new token stored in database',
    );
  }

  /**
   * Check if email is already registered
   */
  async isEmailRegistered(email: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    return !!user;
  }
}
