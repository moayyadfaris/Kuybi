import { Injectable } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'

import { DomainEvent, EventBus, EventsModule, OnDomainEvent } from '@core/events'

class ThingHappenedEvent extends DomainEvent {
  static readonly eventName = 'test.thing.happened'

  constructor(readonly thingId: string) {
    super()
  }
}

@Injectable()
class ThingSubscriber {
  received: ThingHappenedEvent[] = []
  failWith: Error | null = null

  @OnDomainEvent(ThingHappenedEvent)
  async handle(event: ThingHappenedEvent): Promise<void> {
    await Promise.resolve()
    if (this.failWith) throw this.failWith
    this.received.push(event)
  }
}

describe('EventBus (in-process)', () => {
  let moduleRef: TestingModule
  let bus: EventBus
  let subscriber: ThingSubscriber

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      providers: [ThingSubscriber]
    }).compile()
    await moduleRef.init() // subscribers are registered on application bootstrap

    bus = moduleRef.get(EventBus)
    subscriber = moduleRef.get(ThingSubscriber)
  })

  afterEach(() => moduleRef.close())

  it('routes by the static event name and waits for the subscriber to finish', async () => {
    const event = new ThingHappenedEvent('t-1')
    expect(event.eventName).toBe('test.thing.happened')

    await bus.publish(event)

    expect(subscriber.received).toEqual([event])
    expect(subscriber.received[0].occurredAt).toBeInstanceOf(Date)
  })

  it('rejects when a subscriber fails, so the publisher cannot silently continue', async () => {
    subscriber.failWith = new Error('revocation failed')

    await expect(bus.publish(new ThingHappenedEvent('t-2'))).rejects.toThrow('revocation failed')
  })

  it('resolves when nobody subscribes to the event', async () => {
    class UnhandledEvent extends DomainEvent {
      static readonly eventName = 'test.unhandled'
    }

    await expect(bus.publish(new UnhandledEvent())).resolves.toBeUndefined()
  })
})
