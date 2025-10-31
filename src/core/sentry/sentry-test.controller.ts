import { Controller, Get, Post, HttpException, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SentryService } from './sentry.service'

@ApiTags('Sentry Test')
@Controller('sentry-test')
export class SentryTestController {
  constructor(private readonly sentryService: SentryService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if Sentry is enabled' })
  getStatus() {
    return {
      enabled: this.sentryService.isEnabled(),
      message: this.sentryService.isEnabled()
        ? 'Sentry is active and monitoring errors'
        : 'Sentry is disabled'
    }
  }

  @Post('test-error')
  @ApiOperation({ summary: 'Test Sentry error capture (throws 500)' })
  testError() {
    throw new Error('This is a test error to verify Sentry integration')
  }

  @Post('test-http-error')
  @ApiOperation({ summary: 'Test HTTP exception (throws 400 - should NOT go to Sentry)' })
  testHttpError() {
    throw new HttpException(
      'This is a client error and should NOT be sent to Sentry',
      HttpStatus.BAD_REQUEST
    )
  }

  @Post('test-server-error')
  @ApiOperation({ summary: 'Test server error (throws 500 - should go to Sentry)' })
  testServerError() {
    throw new HttpException(
      'This is a server error and should be sent to Sentry',
      HttpStatus.INTERNAL_SERVER_ERROR
    )
  }

  @Post('test-message')
  @ApiOperation({ summary: 'Test Sentry message capture' })
  testMessage() {
    this.sentryService.captureMessage(
      'This is a test message from the Sentry integration',
      'info',
      {
        testData: 'some context',
        timestamp: new Date().toISOString()
      }
    )
    return { message: 'Test message sent to Sentry' }
  }
}
