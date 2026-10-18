import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

import { DomainEvent } from './domain-event'

/**
 * Publishes domain events to the subscribers in other modules.
 *
 * Modules depend on this abstraction rather than on a transport, so the in-process
 * implementation below can be replaced (e.g. by a broker such as Kafka) without
 * touching publishers or subscribers.
 */
export abstract class EventBus {
  /**
   * Delivers the event and resolves once every subscriber has handled it.
   * A subscriber error rejects the returned promise.
   */
  abstract publish(event: DomainEvent): Promise<void>
}

/** In-process delivery via @nestjs/event-emitter: synchronous with the caller's request */
@Injectable()
export class InProcessEventBus extends EventBus {
  constructor(private readonly emitter: EventEmitter2) {
    super()
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.eventName, event)
  }
}
