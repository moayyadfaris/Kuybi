import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile
} from '@nestjs/common'
import { Response } from 'express'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import * as zlib from 'zlib'

/**
 * Compression Interceptor
 *
 * Compresses response bodies using gzip when:
 * 1. Client sends Accept-Encoding: gzip header
 * 2. Response is larger than threshold (1KB default)
 * 3. Content-Type is compressible (JSON, text, etc.)
 */
@Injectable()
export class CompressionInterceptor implements NestInterceptor {
  private readonly threshold: number
  private readonly level: number
  private readonly compressibleTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml'
  ]

  constructor(threshold = 1024, level = 6) {
    this.threshold = threshold
    this.level = level
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => {
        const ctx = context.switchToHttp()
        const response = ctx.getResponse<Response>()
        const request = ctx.getRequest()

        // Skip if client doesn't accept gzip
        const acceptEncoding = request.headers['accept-encoding'] || ''
        if (!acceptEncoding.includes('gzip')) {
          return data
        }

        // Skip if already compressed
        if (response.getHeader('Content-Encoding')) {
          return data
        }

        // Skip if x-no-compression header is present
        if (request.headers['x-no-compression']) {
          return data
        }

        // Skip for StreamableFile (files are handled separately)
        if (data instanceof StreamableFile) {
          return data
        }

        // Convert data to string/buffer
        const body = typeof data === 'string' ? data : JSON.stringify(data)
        const bodyBuffer = Buffer.from(body, 'utf-8')

        // Skip if body is smaller than threshold
        if (bodyBuffer.length < this.threshold) {
          return data
        }

        // Check if content type is compressible
        const contentType = response.getHeader('Content-Type') as string
        const isCompressible = this.compressibleTypes.some(type => contentType?.includes(type))

        if (!isCompressible) {
          return data
        }

        // Compress the response
        try {
          const compressed = zlib.gzipSync(bodyBuffer, {
            level: this.level
          })

          // Set compression headers
          response.setHeader('Content-Encoding', 'gzip')
          response.setHeader('Vary', 'Accept-Encoding')
          response.removeHeader('Content-Length')

          // Return the compressed buffer
          return compressed
        } catch (error) {
          // If compression fails, return original data
          console.error('Compression error:', error)
          return data
        }
      })
    )
  }
}
