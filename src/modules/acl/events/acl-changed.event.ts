import { DomainEvent } from '@core/events'

export type AclChange = 'create' | 'update' | 'delete' | 'permission_grant' | 'permission_revoke'

/**
 * A role or permission was created, changed or deleted, or permissions were granted to or
 * revoked from a role. acl cannot depend on the audit module, so it publishes this event
 * and the audit module records it.
 */
export class AclChangedEvent extends DomainEvent {
  static readonly eventName = 'acl.changed'

  constructor(
    readonly entityType: 'Role' | 'Permission',
    readonly entityId: number,
    readonly change: AclChange,
    readonly actor: { id: string; email?: string },
    readonly details: Record<string, unknown> = {}
  ) {
    super()
  }
}
