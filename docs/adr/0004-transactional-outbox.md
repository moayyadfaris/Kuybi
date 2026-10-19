# 0004. Background jobs are enqueued through a transactional outbox

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Work that follows a database change (welcome and security emails, image processing,
cleanup) runs in the worker through BullMQ queues on Redis. Adding a job directly to
Redis inside a request is not atomic with the database transaction: a job could be
queued for a row that rolled back, or a committed row could lose its job if Redis was
unavailable (an upload stuck in "processing" forever).

## Decision

- Jobs that must happen if and only if a transaction commits are written to the
  `outbox_messages` table **in that transaction**: `OutboxService.enqueue(job, manager)`.
- `OutboxRelayService` runs in the worker. It polls every second, claims up to 50 pending
  messages with `FOR UPDATE SKIP LOCKED` (so several workers never claim the same row),
  and adds each to its BullMQ queue with the message id as the job id, so a redelivery
  after a crash cannot create a duplicate job.
- A message is retried up to 10 times, then marked failed. Dispatched messages are pruned
  after 7 days.
- Jobs that do not depend on a transaction may still be added to a queue directly.

## Consequences

- Delivery is at least once and deduplicated by job id; job handlers must still be
  idempotent (a job can run again after a worker crash mid-job).
- Up to about a second of extra latency before a job starts.
- The outbox table is another thing to monitor.

## Enforcement

- Prometheus gauges (`outbox_*`) and alert rules in
  `docs/observability/alerts/outbox.rules.yml` (backlog age, failed messages).
- Integration tests in `test/integration/outbox/`.
- Review: a queue `add()` next to a database write in the same flow is a smell.
