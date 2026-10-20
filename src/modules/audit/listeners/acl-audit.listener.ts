import { Injectable } from '@nestjs/common'

import { AccessDeniedEvent, AclChangedEvent } from '@modules/acl'

import { OnDomainEvent } from '@core/events'

import { AuditAction, AuditSeverity } from '../entities/audit-log.entity'
import { AuditService } from '../services/audit.service'

const ACTIONS: Record<AclChangedEvent['change'], AuditAction> = {
  create: AuditAction.CREATE,
  update: AuditAction.UPDATE,
  delete: AuditAction.DELETE,
  permission_grant: AuditAction.PERMISSION_GRANT,
  permission_revoke: AuditAction.PERMISSION_REVOKE
}

/**
 * Records every role and permission change (critical: they change what users may do) and
 * every request AbilityGuard refuses for missing permissions
 */
@Injectable()
export class AclAuditListener {
  constructor(private readonly auditService: AuditService) {}

  @OnDomainEvent(AclChangedEvent)
  async record(event: AclChangedEvent): Promise<void> {
    await this.auditService.logAction(
      { userId: event.actor.id, email: event.actor.email },
      {
        action: ACTIONS[event.change],
        entityType: event.entityType,
        entityId: String(event.entityId),
        newValues: event.details,
        severity: AuditSeverity.CRITICAL,
        description: `${event.entityType} ${event.entityId}: ${event.change.replace('_', ' ')}`
      }
    )
  }

  @OnDomainEvent(AccessDeniedEvent)
  async recordDenied(event: AccessDeniedEvent): Promise<void> {
    await this.auditService.logUnauthorizedAccess(
      { userId: event.actor.id, email: event.actor.email, ...event.request },
      event.required
    )
  }
}
