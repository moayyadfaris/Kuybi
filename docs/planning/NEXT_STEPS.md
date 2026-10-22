# Next steps

State on 22 October 2026, after the review of every module and of core, shared,
infrastructure (email), database, queues and configuration. Audit reports and their
resolutions are in [`docs/audits`](../audits). Update this page as items close.

## 1. Before a public launch

### Open defect

| Item                        | What is wrong                                                                                                                                                                                                                                | Fix                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A14: idempotency commit gap | An `@Idempotent` request's outcome is stored after, and separately from, its business transaction. A crash or failed write in between lets a retry with the same key run the work again once the lease expires (for example a second email). | Store the outcome in the handler's own transaction. Touches every `@Idempotent` route. Accepted for now; fix before launch. |

### Decisions needed (product owner)

Each is small once decided; the recommendation is what would be built.

| Item                                                 | Now                                                                           | Recommendation                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/metrics` is public                                 | Anyone who can reach the API reads it                                         | Require a token, or block the path at the proxy                                      |
| Public web rate limit (100 requests / 15 min per IP) | A server-rendered front end sends all visitors from one IP and hits the limit | Exempt the front-end server (shared-secret header); keep the limit for everyone else |
| Story `details` and post repeater/group values       | Stored as plain text, not sanitized                                           | The front end escapes them on output, or sanitize them on save like WYSIWYG fields   |
| Log rotation                                         | Runs in every process; PM2 cluster instances rotate the same files            | Rotate in one process (or the worker), or leave rotation to the platform             |
| Animated GIFs                                        | Image processing keeps only the first frame                                   | Keep the animation (sharp supports it), or document that GIFs are flattened          |
| Field-level permissions                              | Refused: the API rejects permissions with `fields` (fails closed)             | Keep refusing until there is a real design for field-level editing                   |

### Small fixes (no decision needed)

- The rate-limit storage hard-codes the `kuybi:` key prefix instead of using
  `CACHE_NAMESPACE`.
- The idempotency-key prune is an `@Cron` in every API instance. Harmless (an
  idempotent `DELETE`), but it could move to the worker like the other schedules.

## 2. Verify under load

No load test has been run against the reviewed code. Run the Artillery setup in
`test/performance` against login, story and content lists, the public web API and
uploads; check slow queries (`pg_stat_statements`) and the new statement timeout (60s).

## 3. Dependency upgrades

Production dependencies have no known vulnerabilities (`npm audit`, 22 October 2026).
Five major versions are behind; each gets its own branch and the full test gates, and
only releases at least two weeks old are used:

- `ioredis` 5 → 6
- `@keyv/redis` 5 → 6
- `@opentelemetry/resources` 2 → 3
- `typescript` 6 → 7
- `@types/node` 24 → 26 (follow the Node version in use)

## 4. Later

- Review `docs/features`: several pages describe how things worked before the reviews.
- Isolate image processing (a separate worker, or imgproxy).
- Upgrade TypeORM.
- Decide whether the event bus moves to Kafka (it runs on an in-process emitter behind
  an abstraction today).
- Typed configuration accessors. A test already fails when the code reads a key that
  configuration does not define.
