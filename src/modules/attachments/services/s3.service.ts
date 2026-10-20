import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { errorMessage } from '@shared/utils/error.util'
import { CircuitBreaker, withTimeout } from '@shared/utils/resilience'
import { randomUUID } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import { posix as pathPosix } from 'path'

import { contentDisposition } from '../utils/content-disposition.util'

/** Key segments come from client input (category, file extension): keep them plain */
const safeSegment = (value: string, fallback: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50) || fallback
const safeExtension = (value: string): string => {
  const ext = value.replace(/^\./, '').toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(ext) ? `.${ext}` : '.bin'
}

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

/**
 * The attachments bucket: uploads, downloads, ACLs, presigned URLs, behind a timeout and
 * a circuit breaker. Errors reaching clients are generic; details are logged.
 */
@Injectable()
export class S3Service {
  // Assigned in the constructor via initializeS3Client()
  private s3Client!: S3Client
  private bucket!: string
  private region!: string
  private baseUrl!: string
  private readonly timeoutMs: number
  private readonly breaker: CircuitBreaker

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(S3Service.name)
    this.timeoutMs = this.configService.get<number>('resilience.s3.timeoutMs', 10000)
    this.breaker = new CircuitBreaker({
      name: 's3',
      failureThreshold: this.configService.get<number>('resilience.s3.failureThreshold', 5),
      resetTimeoutMs: this.configService.get<number>('resilience.s3.resetTimeoutMs', 30000),
      halfOpenSuccesses: 2
    })
    this.initializeS3Client()
  }

  private initializeS3Client(): void {
    this.region = this.configService.get<string>('s3.region', 'eu-west-1')
    this.bucket = this.configService.get<string>('s3.bucket') ?? ''
    this.baseUrl = this.configService.get<string>('s3.baseUrl', '')

    // Read through config like every other setting (configuration.ts maps S3_ACCESS /
    // S3_SECRET and their aliases); the old process.env read ignored injected config
    const accessKeyId = this.configService.get<string>('s3.accessKeyId')
    const secretAccessKey = this.configService.get<string>('s3.secretAccessKey')

    if (!this.bucket) {
      throw new Error('S3 bucket configuration is missing')
    }

    if (!accessKeyId || !secretAccessKey) {
      this.logger.error(
        { hasAccessKey: !!accessKeyId, hasSecretKey: !!secretAccessKey },
        'S3 credentials are missing'
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

    this.logger.info({ bucket: this.bucket, region: this.region }, 'S3 client initialized')
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

      const result = await this.executeWithResilience('upload', signal =>
        this.s3Client.send(command, { abortSignal: signal })
      )

      this.logger.debug({ key: options.key }, 'Uploaded to S3')

      return {
        key: options.key,
        bucket: this.bucket,
        location: this.getPublicUrl(options.key),
        etag: result.ETag
      }
    } catch (error) {
      // Shape of AWS SDK v3 service errors (S3ServiceException), read for logging only
      const awsError = (error ?? {}) as {
        name?: string
        Code?: string
        code?: string
        $metadata?: { httpStatusCode?: number; requestId?: string }
      }
      this.logger.error(
        {
          errorMessage: errorMessage(error) || 'Unknown error',
          errorName: awsError.name,
          errorCode: awsError.Code || awsError.code,
          statusCode: awsError.$metadata?.httpStatusCode,
          requestId: awsError.$metadata?.requestId,
          key: options.key,
          bucket: this.bucket,
          region: this.region
        },
        'S3 upload failed'
      )
      throw new InternalServerErrorException('Failed to upload file to storage')
    }
  }

  /**
   * Presigned POST for a browser/client to upload one object directly to S3.
   *
   * The signed policy pins the key, the exact byte size and the Content-Type, so S3
   * itself rejects anything else; the object is always private (no ACL field).
   */
  async createPresignedUpload(options: {
    key: string
    contentType: string
    size: number
    expiresInSeconds: number
  }): Promise<{ url: string; fields: Record<string, string> }> {
    return createPresignedPost(this.s3Client, {
      Bucket: this.bucket,
      Key: options.key,
      Fields: { 'Content-Type': options.contentType },
      Conditions: [
        ['content-length-range', options.size, options.size],
        ['eq', '$Content-Type', options.contentType]
      ],
      Expires: options.expiresInSeconds
    })
  }

  /** The first `bytes` bytes of an object (for content-type verification) */
  async readHead(key: string, bytes: number): Promise<Buffer> {
    const result = await this.executeWithResilience('readHead', signal =>
      this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
        { abortSignal: signal }
      )
    )
    if (!result.Body) {
      throw new Error(`S3 returned an empty body for ${key}`)
    }
    return Buffer.from(await result.Body.transformToByteArray())
  }

  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      const result = await this.executeWithResilience('download', signal =>
        this.s3Client.send(command, { abortSignal: signal })
      )

      if (!result.Body) {
        throw new Error(`S3 returned an empty body for ${key}`)
      }
      const bytes = await result.Body.transformToByteArray()

      return Buffer.from(bytes)
    } catch (error) {
      this.logger.error({ key, error: errorMessage(error) }, 'S3 download failed')
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

      await this.executeWithResilience('delete', signal =>
        this.s3Client.send(command, { abortSignal: signal })
      )
      this.logger.debug({ key }, 'Deleted from S3')
    } catch (error) {
      this.logger.error({ key, error: errorMessage(error) }, 'S3 delete failed')
      throw new InternalServerErrorException('Failed to delete file from storage')
    }
  }

  /** A time-limited GET URL; `downloadFilename` makes it download under that name */
  async getPresignedUrl(key: string, expiresIn = 3600, downloadFilename?: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadFilename
          ? contentDisposition(downloadFilename)
          : undefined
      })

      // getSignedUrl does not support abort signals in its options, but the wrapper still enforces timeout.
      const url = await this.executeWithResilience('presign', () =>
        getSignedUrl(this.s3Client, command, { expiresIn })
      )
      return url
    } catch (error) {
      this.logger.error({ key, error: errorMessage(error) }, 'S3 presign failed')
      throw new InternalServerErrorException('Failed to generate download URL')
    }
  }

  /**
   * Make an existing S3 object public
   */
  async makePublic(key: string): Promise<void> {
    await this.setAcl(key, true)
  }

  /**
   * Make an existing S3 object public-read or private
   */
  async setAcl(key: string, isPublic: boolean): Promise<void> {
    const acl = isPublic ? 'public-read' : 'private'
    try {
      const command = new PutObjectAclCommand({ Bucket: this.bucket, Key: key, ACL: acl })

      await this.executeWithResilience('set-acl', signal =>
        this.s3Client.send(command, { abortSignal: signal })
      )
      this.logger.debug({ key, acl }, 'S3 ACL changed')
    } catch (error) {
      this.logger.error({ key, acl, error: errorMessage(error) }, 'S3 ACL change failed')
      throw new InternalServerErrorException('Failed to update file permissions')
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

      const result = await this.executeWithResilience('metadata', signal =>
        this.s3Client.send(command, { abortSignal: signal })
      )

      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        metadata: result.Metadata
      }
    } catch (error) {
      this.logger.warn({ key, error: errorMessage(error) }, 'S3 head failed')
      throw new NotFoundException('File not found in storage')
    }
  }

  /**
   * `<category>/<userId>/<yyyy>/<mm>/<dd>/<timestamp>-<uuid><ext>`. Category and extension
   * come from the client, so both are reduced to plain characters (no slashes, no dots).
   */
  generateKey(
    userId: string,
    originalFilename: string,
    category?: string,
    options?: { extension?: string }
  ): string {
    const now = new Date()
    const date = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0')
    ].join('/')
    const ext = safeExtension(options?.extension ?? pathPosix.extname(originalFilename))
    const prefix = safeSegment(category ?? '', 'uploads')
    return `${prefix}/${userId}/${date}/${Date.now()}-${randomUUID()}${ext}`
  }

  generateVariantKey(baseKey: string, variant: string, extension?: string): string {
    const parsed = pathPosix.parse(baseKey)
    const ext = extension || parsed.ext || '.jpg'
    const sanitizedVariant = variant.replace(/[^a-z0-9_-]/gi, '-')
    const fileName = `${parsed.name}__${sanitizedVariant}${ext.startsWith('.') ? ext : `.${ext}`}`
    return pathPosix.join(parsed.dir, fileName)
  }

  private async executeWithResilience<T>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    return this.breaker.exec(() =>
      withTimeout(fn, this.timeoutMs, () =>
        this.logger.warn(
          { operation, timeoutMs: this.timeoutMs },
          `S3 ${operation} timed out after ${this.timeoutMs}ms`
        )
      )
    )
  }
}
