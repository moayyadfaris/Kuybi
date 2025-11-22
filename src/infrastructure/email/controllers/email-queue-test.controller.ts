import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { EmailQueueService } from '../services/email-queue.service'

/**
 * Email Queue Test Controller
 *
 * Provides endpoints to test queue-based email sending
 */
@ApiTags('Email Queue Testing')
@Controller('v1/email-queue-test')
export class EmailQueueTestController {
  constructor(private readonly emailQueueService: EmailQueueService) {}

  /**
   * Queue a welcome email
   */
  @Post('queue-welcome')
  @ApiOperation({ summary: 'Queue a welcome email for background processing' })
  async queueWelcomeEmail(
    @Body()
    body: {
      email: string
      userName: string
      verificationLink: string
      priority?: number
      delay?: number
    }
  ) {
    const jobId = await this.emailQueueService.queueWelcomeEmail(
      body.email,
      body.userName,
      body.verificationLink,
      {
        priority: body.priority,
        delay: body.delay
      }
    )

    return {
      success: true,
      data: {
        message: 'Welcome email queued successfully',
        jobId,
        to: body.email
      }
    }
  }

  /**
   * Queue a verification email
   */
  @Post('queue-verification')
  @ApiOperation({ summary: 'Queue a verification email for background processing' })
  async queueVerificationEmail(
    @Body()
    body: {
      email: string
      userName: string
      verificationLink: string
      expiresIn?: string
      priority?: number
      delay?: number
    }
  ) {
    const jobId = await this.emailQueueService.queueVerificationEmail(
      body.email,
      body.userName,
      body.verificationLink,
      body.expiresIn,
      {
        priority: body.priority,
        delay: body.delay
      }
    )

    return {
      success: true,
      data: {
        message: 'Verification email queued successfully',
        jobId,
        to: body.email
      }
    }
  }

  /**
   * Queue a verified success email
   */
  @Post('queue-verified-success')
  @ApiOperation({ summary: 'Queue a verified success email for background processing' })
  async queueVerifiedSuccessEmail(
    @Body()
    body: {
      email: string
      userName: string
      loginUrl: string
      priority?: number
      delay?: number
    }
  ) {
    const jobId = await this.emailQueueService.queueVerifiedSuccessEmail(
      body.email,
      body.userName,
      body.loginUrl,
      {
        priority: body.priority,
        delay: body.delay
      }
    )

    return {
      success: true,
      data: {
        message: 'Verified success email queued successfully',
        jobId,
        to: body.email
      }
    }
  }

  /**
   * Get job status
   */
  @Get('job/:jobId')
  @ApiOperation({ summary: 'Get email job status by ID' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.emailQueueService.getJobStatus(jobId)

    if (!status) {
      return {
        success: false,
        error: 'Job not found'
      }
    }

    return {
      success: true,
      data: status
    }
  }

  /**
   * Get queue statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get email queue statistics' })
  async getQueueStats() {
    const stats = await this.emailQueueService.getQueueStats()

    return {
      success: true,
      data: stats
    }
  }

  /**
   * Retry a failed job
   */
  @Post('retry/:jobId')
  @ApiOperation({ summary: 'Retry a failed email job' })
  async retryJob(@Param('jobId') jobId: string) {
    await this.emailQueueService.retryJob(jobId)

    return {
      success: true,
      data: {
        message: 'Job retry initiated',
        jobId
      }
    }
  }

  /**
   * Clean completed jobs
   */
  @Post('clean/completed')
  @ApiOperation({ summary: 'Clean completed email jobs' })
  async cleanCompletedJobs(@Query('olderThanHours') olderThanHours?: number) {
    const hours = olderThanHours || 24
    await this.emailQueueService.cleanCompletedJobs(hours * 60 * 60 * 1000)

    return {
      success: true,
      data: {
        message: `Cleaned completed jobs older than ${hours} hours`
      }
    }
  }

  /**
   * Clean failed jobs
   */
  @Post('clean/failed')
  @ApiOperation({ summary: 'Clean failed email jobs' })
  async cleanFailedJobs(@Query('olderThanDays') olderThanDays?: number) {
    const days = olderThanDays || 7
    await this.emailQueueService.cleanFailedJobs(days * 24 * 60 * 60 * 1000)

    return {
      success: true,
      data: {
        message: `Cleaned failed jobs older than ${days} days`
      }
    }
  }
}
