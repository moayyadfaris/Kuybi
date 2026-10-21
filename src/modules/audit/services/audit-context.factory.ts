import { Injectable } from '@nestjs/common'
import { clientIp, requestIdOf } from '@shared/utils/request.util'
import { Request } from 'express'

import { ContextUser } from '../types/context-user.interface'

import { AuditContext } from './audit.service'

/**
 * Builds the request part of an audit entry (who, from where, which route). Metadata
 * values under sensitive keys (password, token, secret...) are redacted.
 */
@Injectable()
export class AuditContextFactory {
  private sanitizeMetadata(
    metadata?: Record<string, unknown> | null
  ): Record<string, unknown> | undefined {
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

    const sanitizeValue = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item))
      }

      if (value && typeof value === 'object') {
        if (seen.has(value)) {
          return value
        }
        seen.add(value)

        const result: Record<string, unknown> = {}
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

    return sanitizeValue(metadata) as Record<string, unknown>
  }

  fromRequest(req: Request): AuditContext {
    const user = req.user
    const metadata = {
      protocol: req.protocol,
      hostname: req.hostname,
      path: req.path,
      query: req.query,
      userId: user?.id ?? null,
      email: user?.email ?? null
    }

    return {
      userId: user?.id ?? null,
      username: user?.email?.split('@')[0] || 'unknown',
      email: user?.email ?? null,
      ipAddress: this.extractIpAddress(req),
      userAgent: req.get('user-agent') ?? null,
      method: req.method,
      // The path only: a query string can carry tokens (reset and verification links)
      endpoint: (req.originalUrl || req.url).split('?')[0],
      requestId: requestIdOf(req),
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
    // X-Forwarded-For only through trusted proxies (see clientIp)
    return clientIp(req) ?? 'unknown'
  }
}
