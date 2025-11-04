import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common'
import DOMPurify from 'isomorphic-dompurify'

/**
 * Global sanitization pipe to clean all incoming data
 * Removes null bytes, control characters, and trims whitespace
 */
@Injectable()
export class SanitizationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === 'body' || metadata.type === 'query' || metadata.type === 'param') {
      return this.sanitize(value)
    }
    return value
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value)
    }

    if (Array.isArray(value)) {
      return value.map(item => this.sanitize(item))
    }

    if (value !== null && typeof value === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = this.sanitize(val)
      }
      return sanitized
    }

    return value
  }

  private sanitizeString(value: string): string {
    // Remove null bytes
    let sanitized = value.replace(/\0/g, '')

    // Trim whitespace
    sanitized = sanitized.trim()

    // Remove control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    return sanitized
  }
}

/**
 * HTML sanitization pipe for rich text content
 * Use this for endpoints that accept HTML input
 */
@Injectable()
export class HtmlSanitizationPipe implements PipeTransform {
  private readonly allowedTags = [
    'p',
    'br',
    'strong',
    'em',
    'u',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'a',
    'blockquote',
    'code',
    'pre',
    'img'
  ]

  private readonly allowedAttributes = {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height']
  }

  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (typeof value === 'string') {
      return this.sanitizeHtml(value)
    }

    if (value !== null && typeof value === 'object') {
      return this.sanitizeObject(value)
    }

    return value
  }

  private sanitizeHtml(html: string): string {
    const config: Record<string, unknown> = {
      ALLOWED_TAGS: this.allowedTags,
      ALLOWED_ATTR: this.allowedAttributes,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false
    }

    return String(DOMPurify.sanitize(html, config))
  }

  private sanitizeObject(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = this.sanitizeHtml(value)
        } else {
          sanitized[key] = this.sanitizeObject(value)
        }
      }
      return sanitized
    }

    return obj
  }
}

/**
 * Validation pipe with payload size limits
 * Use this to prevent DoS attacks from large payloads
 */
@Injectable()
export class PayloadSizePipe implements PipeTransform {
  constructor(private readonly maxSizeBytes: number = 1024 * 1024) {} // Default 1MB

  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (_metadata.type === 'body') {
      const size = this.calculateSize(value)

      if (size > this.maxSizeBytes) {
        throw new BadRequestException(
          `Payload too large. Maximum size is ${this.formatBytes(this.maxSizeBytes)}, got ${this.formatBytes(size)}`
        )
      }
    }

    return value
  }

  private calculateSize(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }
}
