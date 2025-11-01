import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CopyObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PinoLogger } from 'nestjs-pino'

export interface S3UploadOptions {
  key: string
  buffer: Buffer
  contentType: string
  isPublic?: boolean
  metadata?: Record<string, string>
  cacheControl?: string
}

export interface S3UploadResult {
  key: string
  bucket: string
  location: string
  etag?: string
}

@Injectable()
export class S3Service {
  private s3Client: S3Client
  private bucket: string
  private region: string
  private baseUrl: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(S3Service.name)
    this.initializeS3Client()
  }

  private initializeS3Client(): void {
    this.region = this.configService.get<string>('s3.region', 'eu-west-1')
    this.bucket = this.configService.get<string>('s3.bucket')
    this.baseUrl = this.configService.get<string>('s3.baseUrl', '')

    // WORKAROUND: Use process.env directly as ConfigService is returning empty strings
    const accessKeyId =
      process.env.S3_ACCESS || process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey =
      process.env.S3_SECRET || process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

    if (!this.bucket) {
      throw new Error('S3 bucket configuration is missing')
    }

    if (!accessKeyId || !secretAccessKey) {
      this.logger.error(
        {
          hasAccessKey: !!accessKeyId,
          hasSecretKey: !!secretAccessKey,
          accessKeyLength: accessKeyId?.length,
          secretKeyLength: secretAccessKey?.length,
          envVars: {
            S3_ACCESS: !!process.env.S3_ACCESS,
            S3_SECRET: !!process.env.S3_SECRET
          }
        },
        'S3 credentials are missing or invalid'
      )
      throw new Error(
        'S3 credentials are missing or invalid. Check S3_ACCESS and S3_SECRET in .env'
      )
    }

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })

    this.logger.info(
      `S3 Service initialized for bucket: ${this.bucket} in region: ${this.region} (credentials: ${accessKeyId.substring(0, 8)}...)`
    )
  }

  /**
   * Upload a file to S3
   */
  async upload(options: S3UploadOptions): Promise<S3UploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: options.buffer,
        ContentType: options.contentType,
        ACL: options.isPublic ? 'public-read' : 'private',
        Metadata: options.metadata,
        CacheControl: options.cacheControl || 'max-age=31536000' // 1 year default
      })

      const result = await this.s3Client.send(command)

      this.logger.info(`File uploaded successfully to S3: ${options.key}`)

      return {
        key: options.key,
        bucket: this.bucket,
        location: this.getPublicUrl(options.key),
        etag: result.ETag
      }
    } catch (error) {
      this.logger.error(
        {
          errorMessage: error?.message || 'Unknown error',
          errorName: error?.name,
          errorCode: error?.Code || error?.code,
          statusCode: error?.$metadata?.httpStatusCode,
          requestId: error?.$metadata?.requestId,
          key: options.key,
          bucket: this.bucket,
          region: this.region,
          fullError: JSON.stringify(error, null, 2)
        },
        `Failed to upload file to S3: ${options.key}`
      )
      throw new InternalServerErrorException(
        `Failed to upload file to storage: ${error?.message || 'Unknown S3 error'}`
      )
    }
  }

  /**
   * Download a file from S3
   */
  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      const result = await this.s3Client.send(command)

      // Convert stream to buffer
      const chunks: Buffer[] = []
      for await (const chunk of result.Body as any) {
        chunks.push(chunk)
      }

      this.logger.info(`File downloaded successfully from S3: ${key}`)
      return Buffer.concat(chunks)
    } catch (error) {
      this.logger.error(`Failed to download file from S3: ${key}`, error)
      throw new NotFoundException('File not found in storage')
    }
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      await this.s3Client.send(command)
      this.logger.info(`File deleted successfully from S3: ${key}`)
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${key}`, error)
      throw new InternalServerErrorException('Failed to delete file from storage')
    }
  }

  /**
   * Delete multiple files from S3
   */
  async deleteMultiple(keys: string[]): Promise<void> {
    if (!keys || keys.length === 0) {
      return
    }

    try {
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false
        }
      })

      const result = await this.s3Client.send(command)
      this.logger.info(`${keys.length} files deleted successfully from S3`)

      if (result.Errors && result.Errors.length > 0) {
        this.logger.warn(`Some files failed to delete:`, result.Errors)
      }
    } catch (error) {
      this.logger.error(`Failed to delete multiple files from S3`, error)
      throw new InternalServerErrorException('Failed to delete files from storage')
    }
  }

  /**
   * Check if a file exists in S3
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      await this.s3Client.send(command)
      return true
    } catch (error) {
      if ((error as any).name === 'NotFound') {
        return false
      }
      throw error
    }
  }

  /**
   * Copy a file within S3
   */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey
      })

      await this.s3Client.send(command)
      this.logger.info(`File copied successfully: ${sourceKey} -> ${destinationKey}`)
    } catch (error) {
      this.logger.error(`Failed to copy file in S3: ${sourceKey} -> ${destinationKey}`, error)
      throw new InternalServerErrorException('Failed to copy file in storage')
    }
  }

  /**
   * Generate a presigned URL for temporary access
   */
  async getPresignedUrl(
    key: string,
    expiresIn = 3600, // 1 hour default
    downloadFilename?: string
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadFilename
          ? `attachment; filename="${downloadFilename}"`
          : undefined
      })

      const url = await getSignedUrl(this.s3Client, command, { expiresIn })
      this.logger.info(`Presigned URL generated for: ${key} (expires in ${expiresIn}s)`)

      return url
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for: ${key}`, error)
      throw new InternalServerErrorException('Failed to generate download URL')
    }
  }

  /**
   * Get public URL for a file (if bucket has public access)
   */
  getPublicUrl(key: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl.replace(/\/$/, '')}/${key}`
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<{
    contentType?: string
    contentLength?: number
    lastModified?: Date
    etag?: string
    metadata?: Record<string, string>
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      const result = await this.s3Client.send(command)

      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata
      }
    } catch (error) {
      this.logger.error(`Failed to get file metadata from S3: ${key}`, error)
      throw new NotFoundException('File not found in storage')
    }
  }

  /**
   * Generate upload key with organized structure
   */
  generateKey(userId: string, originalFilename: string, category?: string): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')

    // Sanitize filename
    const ext = originalFilename.substring(originalFilename.lastIndexOf('.'))
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)

    const baseCategory = category || 'uploads'
    return `${baseCategory}/${userId}/${year}/${month}/${day}/${timestamp}-${random}${ext}`
  }
}
