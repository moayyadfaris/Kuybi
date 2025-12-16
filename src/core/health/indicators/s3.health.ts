import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus'
import { GetBucketLocationCommand, S3Client } from '@aws-sdk/client-s3'

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  private readonly s3Client: S3Client
  private readonly bucketName: string

  constructor(private configService: ConfigService) {
    super()

    this.bucketName = this.configService.get<string>('s3.bucket')!

    this.s3Client = new S3Client({
      region: this.configService.get<string>('s3.region')
    })
  }

  private readonly logger = new Logger(S3HealthIndicator.name)

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
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

      const result = this.getStatus(key, true, {
        bucket: this.bucketName,
        responseTime: `${responseTime}ms`
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(
        `S3 health check failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      )

      throw new HealthCheckError(
        `S3 health check failed: ${errorMessage}`,
        this.getStatus(key, false, {
          bucket: this.bucketName,
          error: errorMessage
        })
      )
    }
  }
}
