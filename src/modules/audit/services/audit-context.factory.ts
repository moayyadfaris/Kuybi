import { Injectable } from '@nestjs/common'
import { Request } from 'express'

import { ContextUser } from '../types/context-user.interface'

import { AuditContext } from './audit.service'

@Injectable()
export class AuditContextFactory {
  private sanitizeMetadata(metadata?: Record<string, any> | null): Record<string, any> | undefined {
    if (!metadata) {
      return undefined
    }

    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apikey',
      'api-key',
      'api_key',
      'ssn',
      'creditcard',
      'credit-card'
    ]

    const shouldRedact = (key: string) =>
      sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))

    const seen = new WeakSet<object>()

    const sanitizeValue = (value: any): any => {
      if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item))
      }

      if (value && typeof value === 'object') {
        if (seen.has(value)) {
          return value
        }
        seen.add(value)

        const result: Record<string, any> = {}
        for (const [key, nestedValue] of Object.entries(value)) {
          if (shouldRedact(key)) {
            result[key] = '[REDACTED]'
          } else {
            result[key] = sanitizeValue(nestedValue)
          }
        }
        return result
      }

      return value
    }

    return sanitizeValue(metadata) as Record<string, any>
  }

  fromRequest(req: Request & { user?: any }): AuditContext {
    const user = req.user
    const metadata = {
      protocol: req.protocol,
      hostname: req.hostname,
      path: req.path,
      query: req.query,
      userId: user?.id ?? user?.userId ?? null,
      email: user?.email ?? null
    }

    return {
      userId: user?.id ?? user?.userId ?? null,
      username: user?.email?.split('@')[0] || user?.firstName || 'unknown',
      email: user?.email ?? null,
      ipAddress: this.extractIpAddress(req),
      userAgent: req.get('user-agent') ?? null,
      method: req.method,
      endpoint: req.originalUrl || req.url,
      requestId:
        (req.headers['x-request-id'] as string) ||
        (req.headers['x-correlation-id'] as string) ||
        null,
      metadata: this.sanitizeMetadata(metadata)
    }
  }

  withUser(context: AuditContext, user?: ContextUser): AuditContext {
    if (!user) {
      return context
    }

    const resolvedId = user.id ?? user.userId ?? context.userId ?? null
    const resolvedEmail = user.email ?? context.email ?? null
    const username = user.name || resolvedEmail?.split('@')[0] || context.username || 'unknown'

    const mergedMetadata = {
      ...(context.metadata ?? {}),
      userId: resolvedId,
      email: resolvedEmail
    }

    return {
      ...context,
      userId: resolvedId,
      username,
      email: resolvedEmail,
      metadata: this.sanitizeMetadata(mergedMetadata)
    }
  }

  private extractIpAddress(req: Request): string {
    const forwardedFor = req.get('x-forwarded-for')
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim()
    }

    const realIp = req.get('x-real-ip')
    if (realIp) {
      return realIp
    }

    return req.ip || req.socket.remoteAddress || 'unknown'
  }
}
