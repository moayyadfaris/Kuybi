# Queues

Background work runs in BullMQ queues on Redis (`REDIS_QUEUE_DB`, apart from the cache).
The API process produces jobs; the worker process (`src/worker.ts`) consumes them and
runs every recurring job. Nothing recurring runs in the API.

## Queues

| Queue                         | Processor (worker)           | Jobs                                                                                            | Attempts |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `email-queue`                 | `EmailProcessor`             | welcome, verification, password reset/changed, account locked/unlocked                          | 5        |
| `attachment-processing-queue` | `AttachmentProcessor`        | `process-image`; `remove-abandoned-uploads` (hourly at :15)                                     | 3        |
| `account-security-queue`      | `AccountSecurityProcessor`   | `unlock-account` (when a lock ends), `reset-failed-attempts`, expired-lock sweep (every 15 min) | 3        |
| `session-cleanup-queue`       | `SessionCleanupProcessor`    | ended sessions (hourly), expired reset tokens (daily 03:30)                                     | 3        |
| `version-cleanup-queue`       | `VersionCleanupProcessor`    | prune automatic story versions (daily 02:00)                                                    | 2        |
| `content-publishing-queue`    | `ContentPublishingProcessor` | publish scheduled entries (every minute)                                                        | 2        |
| `audit-retention-queue`       | `AuditRetentionProcessor`    | purge expired audit rows (daily 03:00)                                                          | 2        |
| `dead-letter-queue`           | none: handled by hand        | copies of jobs that failed every attempt                                                        | -        |

All schedule times are UTC.

## Producing jobs

Jobs that follow a database change go through the transactional outbox
(`src/core/outbox`), never `queue.add()`: the job is a row written in the same
transaction, and `OutboxRelay` (worker) hands it to BullMQ. A rolled-back change sends
nothing, and a Redis outage delays jobs instead of losing them.

```ts
await dataSource.transaction(async manager => {
  const user = await manager.save(newUser)
  await emailQueueService.queueWelcomeEmail(user.email, name, link, { manager })
  // or, for any queue:
  await outbox.enqueue({ queue: QueueName.X, name: 'job', data, delayMs: 0 }, manager)
})
```

The exception is the account-lockout jobs (`AccountLockoutService`): delayed jobs tied to
a lock or a counter, which check the row again when they run.

## Writing a processor

- Extend `BaseProcessor`: it logs the job lifecycle and copies a job that failed its last
  attempt to `dead-letter-queue` (once; id `<queue>-<job id>`). Job data is not logged;
  `getDeadLetterData` / `getLogData` decide what of it is kept or logged (emails redact
  their links).
- Put the processor in the module's `<module>-jobs.module.ts`, which only
  `src/worker.module.ts` imports: a processor starts consuming as soon as it exists.
- Delivery is at least once (retries, a worker dying mid-job, outbox re-dispatch).
  Make every job safe to run twice: conditional updates, `ON CONFLICT`, "delete what is
  due" batches. A job acting on a row checks the row's current state, not the state
  when it was queued (see the lockout and visibility jobs).
- Rate limits are worker options (`@Processor(name, { concurrency, limiter })`); BullMQ
  ignores them on the queue. BullMQ has no job timeout: a job that must not run long
  takes a time budget and passes its `AbortSignal` down (`AttachmentProcessor`).

## Recurring jobs

Each module registers its schedules in a `*.scheduler.ts` of its jobs module with
`queue.upsertJobScheduler(id, { pattern, tz: 'UTC' }, template)`. Upserting by id makes
it safe for every worker to run at start-up: the schedule exists once, and a changed
pattern or payload applies on the next start. To retire a schedule, call
`removeJobScheduler(id)` in its scheduler (see `VersionCleanupScheduler`).

## Settings

`config/queue.config.ts`: the Redis connection fallbacks, default job options (3
attempts, exponential backoff from 2s, completed jobs kept 24h / 1000, failed 7 days / 5000) and per-queue overrides. Email jobs override retention: completed 10 minutes,
failed 1 day (they carry live links).

## Operating

- **Metrics**: `queue_jobs{queue, state}` on `/metrics` (`queue-metrics.ts`); alert rules
  in `docs/observability/alerts/queues.rules.yml` (dead letters, backlog) and
  `outbox.rules.yml` (relay stalled, failed messages).
- **Dashboard**: `npm run start:dashboard` (prod: `npm run start:dashboard:prod`). Needs
  `BULL_BOARD_PASSWORD`; listens on 127.0.0.1:4050 unless `BULL_BOARD_HOST` is set, so
  reach it through an SSH tunnel or an authenticating TLS proxy.
- **Dead letters**: inspect `failedReason` in the dashboard, fix the cause, then retry the
  original job or remove the entry. They are kept until someone does.
- **Worker**: `npm run start:worker:dev` (dev), `npm run start:worker` (built) or
  `pm2 start ecosystem.config.js --only kuybi-worker`. On SIGTERM it lets active jobs finish (up to
  `WORKER_SHUTDOWN_TIMEOUT_MS`, 30s); a job cut off is retried.
