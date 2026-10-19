# 0006. Domain events in process now; broker (Kafka) decision open

- **Status:** Accepted (in-process bus). Broker choice: **open**.
- **Date:** 2026-10-18

## Context

Some modules must react to another module's changes without importing it, e.g. auth
revoking a user's sessions when the users module resets their credentials (a direct call
would create a users → auth dependency). Other services are being built alongside Kuybi
and may later need to consume its events, which raises the question of a broker such as
Kafka.

## Decision

- Modules publish typed domain events through the `EventBus` abstraction
  (`core/events`); subscribers use `@OnDomainEvent`. Publishers and subscribers never
  name a transport.
- The current implementation, `InProcessEventBus`, uses `@nestjs/event-emitter`.
  `publish()` resolves once every subscriber has handled the event, and a subscriber
  error rejects it (`suppressErrors: false`), so a failed reaction fails the request
  instead of being lost.
- Work that must survive a crash goes through the outbox
  ([0004](0004-transactional-outbox.md)), not through an in-process event.

### Open: adopting a broker

Not decided. Revisit when any of these becomes true:

1. Another service needs Kuybi's events (cross-process consumers).
2. Events must be replayable or retained (audit, rebuilding read models).
3. Event volume or fan-out makes in-request delivery too slow.

If adopted, the expected shape is: domain events written to the outbox in the publishing
transaction and relayed to the broker (no dual write), plus a `KafkaEventBus`
implementation of `EventBus`. In-process subscribers that need synchronous failure
semantics would stay in process.

## Consequences

- No broker to operate today; events are as reliable as the request that publishes them.
- Switching transports later touches the bus implementation and its wiring, not the
  publishers or subscribers.

## Enforcement

- Lint keeps modules from importing each other's internals
  ([0001](0001-modular-monolith-shared-schema.md)); events are the sanctioned way to react
  across modules without a dependency.
- `test/unit/core/events/event-bus.spec.ts`.
