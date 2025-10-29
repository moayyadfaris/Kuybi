import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as nodemailer from 'nodemailer'
import { Transporter } from 'nodemailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'
import { EmailTemplateService } from './email-template.service'
import { SendEmailDto } from '../dto/send-email.dto'
import { EmailOptions } from '../interfaces/email-template.interface'

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: Transporter<SMTPTransport.SentMessageInfo>
  private readonly defaultFrom: string

  constructor(
    private readonly configService: ConfigService,
    private readonly emailTemplateService: EmailTemplateService,
    @InjectPinoLogger(EmailService.name)
    private readonly logger: PinoLogger
  ) {
    this.defaultFrom = this.configService.get<string>('email.from', 'noreply@kuybi.dev')
  }

  async onModuleInit() {
    await this.initializeTransporter()
  }

  /**
   * Initialize SMTP transporter
   */
  private async initializeTransporter(): Promise<void> {
    const host = this.configService.get<string>('email.smtp.host')
    const port = this.configService.get<number>('email.smtp.port', 587)
    const secure = this.configService.get<boolean>('email.smtp.secure', false)
    const user = this.configService.get<string>('email.smtp.user')
    const pass = this.configService.get<string>('email.smtp.password')

    const smtpConfig: any = {
      host,
      port,
      secure,
      auth: {
        user,
        pass
      },
      // Advanced connection settings to fix IPv6 issues
      family: 4, // Force IPv4
      dnsTimeout: 30000,
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000
    }

    // If using IP address, disable TLS hostname verification
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      smtpConfig.tls = {
        rejectUnauthorized: false,
        servername: 'smtp.ethereal.email'
      }
    }

    this.logger.debug(
      {
        host,
        port,
        secure,
        user,
        isIP: /^\d+\.\d+\.\d+\.\d+$/.test(host)
      },
      'Initializing SMTP transporter'
    )

    this.transporter = nodemailer.createTransport(smtpConfig) as any

    // Verify connection
    try {
      await this.transporter.verify()
      this.logger.info({ host, port }, 'SMTP connection verified successfully')
    } catch (error) {
      this.logger.error(
        {
          error: error.message,
          host,
          port,
          code: error.code
        },
        'Failed to verify SMTP connection - continuing anyway'
      )
      // Don't throw - allow app to start even if SMTP is misconfigured
    }

    // Preload templates in production
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      await this.emailTemplateService.preloadTemplates()
    }
  }

  /**
   * Send email with raw content
   */
  async sendMail(dto: SendEmailDto): Promise<void> {
    try {
      const mailOptions = {
        from: dto.from || this.defaultFrom,
        to: dto.to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html
      }

      const result = await this.transporter.sendMail(mailOptions)

      this.logger.info(
        {
          to: dto.to,
          subject: dto.subject,
          messageId: result.messageId
        },
        'Email sent successfully'
      )
    } catch (error) {
      this.logger.error(
        {
          to: dto.to,
          subject: dto.subject,
          error: error.message
        },
        'Failed to send email'
      )
      throw error
    }
  }

  /**
   * Send email using template
   */
  async sendTemplatedEmail(options: EmailOptions): Promise<void> {
    try {
      // Render template
      const html = await this.emailTemplateService.render(options.template, options.context)

      // Send email
      await this.sendMail({
        to: options.to,
        subject: options.subject,
        html,
        from: options.from
      })

      this.logger.info(
        {
          to: options.to,
          template: options.template,
          subject: options.subject
        },
        'Templated email sent successfully'
      )
    } catch (error) {
      this.logger.error(
        {
          to: options.to,
          template: options.template,
          error: error.message
        },
        'Failed to send templated email'
      )
      throw error
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, userName: string, verificationLink: string): Promise<void> {
    return this.sendTemplatedEmail({
      to: email,
      subject: 'Welcome to Kuybi! Verify Your Email',
      template: 'welcome' as any,
      context: {
        userName,
        verificationLink,
        userEmail: email
      }
    })
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(
    email: string,
    userName: string,
    verificationLink: string,
    expiresIn: string = '24 hours'
  ): Promise<void> {
    return this.sendTemplatedEmail({
      to: email,
      subject: 'Verify Your Email Address',
      template: 'verification' as any,
      context: {
        userName,
        verificationLink,
        userEmail: email,
        expiresIn
      }
    })
  }

  /**
   * Send email verified success notification
   */
  async sendEmailVerifiedSuccess(email: string, userName: string, loginUrl: string): Promise<void> {
    return this.sendTemplatedEmail({
      to: email,
      subject: 'Email Verified Successfully',
      template: 'verified-success' as any,
      context: {
        userName,
        userEmail: email,
        loginUrl
      }
    })
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    userName: string,
    resetLink: string,
    expiresIn: string = '1 hour'
  ): Promise<void> {
    return this.sendTemplatedEmail({
      to: email,
      subject: 'Reset Your Password - Kuybi',
      template: 'password-reset' as any,
      context: {
        userName,
        userEmail: email,
        resetLink,
        expiresIn
      }
    })
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(
    email: string,
    userName: string,
    changeTime: Date,
    ipAddress?: string
  ): Promise<void> {
    return this.sendTemplatedEmail({
      to: email,
      subject: 'Your Password Was Changed - Kuybi',
      template: 'password-changed' as any,
      context: {
        userName,
        userEmail: email,
        changeTime: changeTime.toLocaleString(),
        ipAddress: ipAddress || 'Unknown'
      }
    })
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify()
      return true
    } catch (error) {
      this.logger.error({ error: error.message }, 'SMTP connection test failed')
      return false
    }
  }
}
