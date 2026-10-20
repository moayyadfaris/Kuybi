import { clientIp } from '@shared/utils/request.util'
import type { Request } from 'express'

import { DomainEvent } from '@core/events'

import type { AclPrincipal } from '../types/acl-principal'

/**
 * A guard refused a signed-in user for missing permissions (AbilityGuard, SuperAdminGuard,
 * RoleHierarchyGuard). acl cannot depend on the audit module, so it publishes this event
 * and the audit module records it.
 */
export class AccessDeniedEvent extends DomainEvent {
  static readonly eventName = 'acl.access.denied'

  constructor(
    readonly actor: { id: string; email?: string },
    /** What the route needs, e.g. "read Story" or "super-admin" */
    readonly required: string,
    readonly request: {
      method: string
      endpoint: string
      ipAddress?: string
      userAgent?: string
      requestId?: string
    }
  ) {
    super()
  }

  static fromRequest(req: Request, actor: AclPrincipal, required: string): AccessDeniedEvent {
    const header = (name: string) => req.headers?.[name] as string | undefined
    return new AccessDeniedEvent({ id: actor.id, email: actor.email }, required, {
      method: req.method,
      // The path only: a query string can carry tokens
      endpoint: (req.originalUrl || req.url).split('?')[0],
      ipAddress: clientIp(req),
      userAgent: header('user-agent'),
      requestId: header('x-request-id') ?? header('x-correlation-id')
    })
  }
}
