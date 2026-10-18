import { OnEvent } from '@nestjs/event-emitter'

import { DomainEvent, DomainEventClass } from './domain-event'

/**
 * Subscribes a provider method to a domain event.
 *
 * Errors propagate to the publisher (the @OnEvent default swallows them), so a
 * failing subscriber fails the operation that published the event instead of
 * leaving it half-done.
 */
export function OnDomainEvent<E extends DomainEvent>(event: DomainEventClass<E>): MethodDecorator {
  return OnEvent(event.eventName, { suppressErrors: false })
}
