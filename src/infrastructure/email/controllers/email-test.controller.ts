import { Controller, Post, Body, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { EmailService } from '../services/email.service'
import { SendEmailDto } from '../dto/send-email.dto'

@ApiTags('Email (Test)')
@Controller('v1/email-test')
export class EmailTestController {
  constructor(private readonly emailService: EmailService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check SMTP connection' })
  @ApiResponse({ status: 200, description: 'Connection status' })
  async checkConnection() {
    const isConnected = await this.emailService.testConnection()
    return {
      status: isConnected ? 'connected' : 'disconnected',
      message: isConnected ? 'SMTP connection successful' : 'SMTP connection failed'
    }
  }

  @Post('send')
  @ApiOperation({ summary: 'Send test email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendTestEmail(@Body() dto: SendEmailDto) {
    await this.emailService.sendMail(dto)
    return {
      message: 'Email sent successfully',
      to: dto.to,
      subject: dto.subject
    }
  }

  @Post('send-welcome')
  @ApiOperation({ summary: 'Send welcome email (test)' })
  @ApiResponse({ status: 200, description: 'Welcome email sent' })
  async sendWelcomeTest(
    @Body() data: { email: string; userName: string; verificationLink: string }
  ) {
    await this.emailService.sendWelcomeEmail(data.email, data.userName, data.verificationLink)
    return {
      message: 'Welcome email sent successfully',
      to: data.email
    }
  }

  @Post('send-verification')
  @ApiOperation({ summary: 'Send verification email (test)' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  async sendVerificationTest(
    @Body()
    data: {
      email: string
      userName: string
      verificationLink: string
      expiresIn?: string
    }
  ) {
    await this.emailService.sendVerificationEmail(
      data.email,
      data.userName,
      data.verificationLink,
      data.expiresIn
    )
    return {
      message: 'Verification email sent successfully',
      to: data.email
    }
  }

  @Post('send-verified-success')
  @ApiOperation({ summary: 'Send email verified success notification (test)' })
  @ApiResponse({ status: 200, description: 'Success email sent' })
  async sendVerifiedSuccessTest(
    @Body() data: { email: string; userName: string; loginUrl: string }
  ) {
    await this.emailService.sendEmailVerifiedSuccess(data.email, data.userName, data.loginUrl)
    return {
      message: 'Email verified success notification sent',
      to: data.email
    }
  }
}
