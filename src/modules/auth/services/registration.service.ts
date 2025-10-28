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
      },
      'User registered successfully',
    );

    // Note: We're storing the token in a separate table or Redis in production
    // For now, we'll return the user and handle verification separately
    return savedUser;
  }

  /**
   * Verify user email
   */
  async verifyEmail(token: string): Promise<User> {
    // In production, validate token from database or Redis
    // For now, we'll implement a simplified version
    
    this.logger.info({ token }, 'Email verification requested');

    throw new BadRequestException(
      'Email verification functionality coming soon. Tokens will be validated against database.',
    );
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
      },
      'Verification email resent',
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
