/**
 * A fact that happened in one module and that other modules may react to.
 *
 * Each event class declares a static `eventName` (`<module>.<entity>.<past-tense-verb>`)
 * and is owned by the module that publishes it; subscribers import it from there.
 */
export abstract class DomainEvent {
  readonly occurredAt: Date = new Date()

  /** Routing key, read from the subclass's static `eventName` */
  get eventName(): string {
    return (this.constructor as DomainEventClass).eventName
  }
}

export interface DomainEventClass<E extends DomainEvent = DomainEvent> {
  readonly eventName: string
  new (...args: never[]): E
}
