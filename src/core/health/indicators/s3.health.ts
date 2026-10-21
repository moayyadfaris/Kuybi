import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus'
import { GetBucketLocationCommand, S3Client } from '@aws-sdk/client-s3'

@Injectable()
export class S3HealthIndicator {
  private readonly s3Client: S3Client
  private readonly bucketName: string

  constructor(
    private readonly configService: ConfigService,
    private readonly healthIndicatorService: HealthIndicatorService
  ) {
    this.bucketName = this.configService.get<string>('s3.bucket')!

    // The credentials the app uses for S3 (S3Service), not whatever the SDK finds
    const accessKeyId = this.configService.get<string>('s3.accessKeyId')
    const secretAccessKey = this.configService.get<string>('s3.secretAccessKey')
    this.s3Client = new S3Client({
      region: this.configService.get<string>('s3.region'),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {})
    })
  }

  private readonly logger = new Logger(S3HealthIndicator.name)

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key)

    try {
      if (!this.bucketName) {
        throw new Error('S3 bucket name is not configured')
      }

      const command = new GetBucketLocationCommand({
        Bucket: this.bucketName
      })

      const startTime = Date.now()
      await this.s3Client.send(command)
      const responseTime = Date.now() - startTime

      return indicator.up({
        bucket: this.bucketName,
        responseTime: `${responseTime}ms`
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(
        `S3 health check failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      )

      // HealthCheckService treats a "down" result as unhealthy and returns 503
      return indicator.down({
        bucket: this.bucketName,
        error: errorMessage
      })
    }
  }
}
