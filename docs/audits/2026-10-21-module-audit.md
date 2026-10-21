# Kuybi code, security, performance, setup, and architecture audit

Date: 21 October 2026 (Asia/Amman). Baseline commit: `c91bb3169d412892c7d33bbbb4b1b897a203f53b`.

## Assessment

The modular monolith is a sound foundation, but I would address the high-priority findings before treating it as production-ready. The largest risks are inconsistent authorization enforcement, mutable upload objects, memory consumption during uploads, and security operations split across multiple commits. Dependency scanning did not identify known production dependency vulnerabilities.

This is a repository audit covering all **11 feature modules**, API/worker/dashboard entry points, core infrastructure, database setup, tests, Docker, and PM2. The inventory contains 451 files under `src`. Review concentrated on controllers, authorization, services, repositories, validation, background processing, and deployment boundaries; this is not a claim that every line or every possible execution path was verified.

There are **9 high, 12 medium, and 1 low-priority findings** below. High means a material authorization, confidentiality, availability, or deployment-control failure under the stated trigger; medium means a narrower security weakness or reliability/correctness problem. These are review priorities, not CVSS scores. No critical finding is asserted.

The working tree changed concurrently during this audit, particularly cache configuration, cache implementation, and cache tests. Those edits were not made by this audit. Transient compilation failures are recorded separately from the numbered findings. References below use repository-relative paths and line numbers; check them against the reviewed revision when applying fixes.

## Verification and limits

| Check                                            | Result                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                          | Used locally installed Node 24.22.0 after detecting that the default shell used unsupported Node 22.12.0                                                                                                                                                              |
| Module graph                                     | Passed: 11 modules, 23 dependencies, no cycles under the repository's graph rules                                                                                                                                                                                     |
| Field initialization                             | Passed: no uninitialized fields outside entities/DTOs; 535 framework-populated fields exempt                                                                                                                                                                          |
| Unit tests                                       | First run: 49 suites/370 tests passed; one suite was blocked from binding its HTTP server by the sandbox. Focused rerun with socket access passed its one test. All 50 suites/371 tests passed across these runs                                                      |
| Production dependency audit                      | `npm audit --omit=dev --json`: 0 reported vulnerabilities; 604 production dependencies in audit metadata                                                                                                                                                              |
| Full typecheck                                   | Final rerun passed. Earlier attempts during concurrent cache edits encountered a replaced test file, a cache-test signature error, and TS2322 involving incompatible Keyv types; these no longer blocked the final check                                              |
| Build                                            | Final `npm run build` passed under Node 24.22.0                                                                                                                                                                                                                       |
| Source-only TypeScript check                     | Encountered the Keyv TS2322 during the intermediate edits; final full-project typecheck and build subsequently passed                                                                                                                                                 |
| Targeted local probes                            | Reproduced inactive super-admin access, conditional-content editor escalation, ignored field restrictions, acceptance of production bcrypt cost 4, unsafe WYSIWYG acceptance, matching fingerprints across different paths, and stale cache refill after invalidation |
| Lint                                             | Not run; the applied review skill excludes running linters                                                                                                                                                                                                            |
| Integration, load, deployment, and live S3 tests | Not run. No database reset/migration, live upload, production mutation, or destructive load test was performed                                                                                                                                                        |

Performance findings concern observable algorithms and resource limits. No p95 latency, throughput, production query plan, or real infrastructure capacity is claimed. The npm result concerns known advisories returned at audit time; it does not establish application security. Unit tests ran before the concurrent cache edits were finished; final typecheck/build reflect the later working-tree state.

## Feature-module coverage

| Module        | Review result and main action                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acl`         | Good fail-closed route guard, explicit record scopes, and role hierarchy checks. Fix the super-admin role-liveness bypass and enforce field/record restrictions consistently: A01–A03                                                  |
| `auth`        | Strong hashed refresh secrets, conditional rotation, password policy, and single-use token claims. Make password reset/revocation atomic, wire email URLs and refresh lifetime: A06, A11, A20                                          |
| `users`       | Separate self/admin controllers and explicit profile DTOs are useful. Role helper methods disagree with ACL liveness; inspect concurrent role and identity changes alongside A01/A06                                                   |
| `attachments` | Content sniffing, safe key segments, EXIF stripping, and owner checks are useful. Upload finalization, buffering, startup credentials, and visibility races need attention: A04, A05, A12, A21                                         |
| `stories`     | Scoped reads and public/private presentation are well separated. Fix stale cache refill, write conflicts, unbounded children, and version-chain reads: A03, A07, A15, A19                                                              |
| `post-types`  | Dynamic validation and serialized uniqueness checks are useful. Conditional authorization is incomplete and rich HTML is unsanitized: A02, A09, A13, A15                                                                               |
| `categories`  | Sort identifiers are allowlisted; queries are parameterized; live-slug uniqueness is database-backed. Shared field-permission and concurrency limitations apply: A03/A15. No separate high-priority module-specific defect established |
| `tags`        | Names are normalized and live uniqueness is database-backed; system-tag restrictions are explicit. Shared field-permission and concurrency limitations apply: A03/A15. No separate high-priority module-specific defect established    |
| `countries`   | Bounded reference-data queries, sort allowlisting, and field selection. Zero-based paging differs from most APIs; document that contract. No separate material module-specific defect established                                      |
| `audit`       | Append path, bounded queries, retention, and failed-login recording are useful. Summary totals are sample counts; best-effort audit writes can be lost: A22 and architecture notes                                                     |
| `web`         | Explicit response allowlists, published-only filters, and constrained media URLs are useful. Shared stale-story cache behavior can expose a withdrawn publication: A07; public query cost needs measurement                            |

Core/infrastructure review covered configuration, JWT guards, caching/base repositories, idempotency, events, outbox, BullMQ, logging, health, tracing/metrics, Sentry, shutdown, email, database wiring/migrations, and process setup.

## High-priority findings

### A01 — Disabled super-admin roles retain unrestricted access

Evidence: `src/modules/users/entities/user.entity.ts:138`, `src/modules/acl/abilities/ability.factory.ts:54`, `src/modules/acl/guards/super-admin.guard.ts:30`.

`User.hasRole()` checks the role name and assignment state but ignores the role's `isActive`/`deletedAt`. `AbilityFactory` grants super-admin unrestricted access before its normal live-role filter runs. `SuperAdminGuard` trusts the same helper. Disabling the super-admin role therefore does not remove its holders' powers. `getHighestPriorityRole()` has the same liveness inconsistency for hierarchy checks.

Local reproduction: a `User` whose primary role is `{ name: 'super-admin', isActive: false }` still produces an ability that can `manage all`.

Fix: centralize live-role selection and use it in every role helper, hierarchy comparison, and super-admin bypass. Test inactive/deleted primary and additional roles, including expiration values read from JSON.

### A02 — Conditional Content permissions become global editor access

Evidence: `src/modules/post-types/services/content-access.policy.ts:20`, `src/modules/post-types/controllers/content.controller.ts:148`, `src/modules/post-types/controllers/content.controller.ts:217`.

`isEditor()` asks CASL whether the user can update the **subject type**, then uses that answer to expose every draft/deleted entry and inactive type. Update/delete/publish/schedule routes load the entry without checking the action against that entry. A custom role granting only `update Content {authorId: ownId}` consequently sees others' drafts and can update others' entries. Conditional delete/publish rules have the same route-versus-record gap.

Local reproduction: `isEditor(user)` is true for an own-content permission while CASL explicitly denies updating a record authored by another user.

Fix: implement per-content authorization and scoped list queries, as the story module already does. Check the tagged entry for each mutation and apply read rules to lists/details. Test own/other author and post-type conditions. [CASL's primary documentation describes conditions on subjects](https://github.com/stalniy/casl).

### A03 — Permission `fields` are stored but not enforced by mutation/presentation paths

Evidence: `src/modules/acl/abilities/ability.factory.ts:91`, `src/modules/stories/services/story-access.policy.ts:38`, `src/modules/stories/services/stories.service.ts:251`.

The permission model accepts CASL field restrictions, but feature policies generally call `can(action, record)` without the field argument, and services merge all DTO-allowed fields. `StoryAccessPolicy.forViewer()` also interprets any update permission as permission to see all editor-only fields. A role restricted to editing `title` can therefore pass the update policy and change/read fields outside that grant.

Local reproduction: the story policy permits update for a title-only rule while CASL denies `internalNotes` when asked about that field.

Fix: enforce permitted fields for both writes and reads, including nested field data, or reject field-scoped permissions until they are supported. Preserve separate status/publish checks. Add negative authorization tests at the controller/service boundary. [CASL documents field-level restrictions](https://github.com/stalniy/casl).

### A04 — Direct-upload verification is not bound to immutable bytes

Evidence: `src/modules/attachments/services/s3.service.ts:177`, `src/modules/attachments/services/direct-upload.service.ts:128`, `src/modules/attachments/services/direct-upload.service.ts:142`, `src/modules/attachments/jobs/attachment.processor.ts:73`.

The presigned POST permits writes to the same attachment key for 15 minutes. Completion reads metadata and a prefix, then publishes or queues that same mutable key; the worker later downloads whichever object is current. Neither the checked ETag nor an S3 version ID is carried into finalization. The client can replace the object between verification and use with different same-sized bytes under the signed MIME declaration. Replaying after completion also changes what downloads retrieve, though a replacement's public accessibility depends on S3 ACL/policy behavior.

Fix: upload to a staging key and finalize a specific immutable object version into a new key that the client cannot write. Bind validation, worker input, and downloads to that version; enforce conditional copy/read semantics. Shortening expiry alone does not close the race. AWS confirms [presigned requests are reusable until expiry and same-key uploads replace objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html). This finding is based on code and documented storage behavior; no live S3 exploit was attempted.

### A05 — A single bulk request may buffer roughly 2 GB

Evidence: `src/modules/attachments/controllers/attachments.controller.ts:160`, `src/modules/attachments/controllers/attachments.controller.ts:178`, `src/modules/attachments/services/file-validation.service.ts:44`.

The endpoint accepts 20 files, each up to 100 MiB, using Multer memory storage. All files are buffered before service validation, then processed concurrently with `Promise.allSettled`. One authorized uploader can submit approximately 2,000 MiB, plus processing/copy overhead, against API processes configured for a 500 MB restart threshold. Rate limiting requests does not bound bytes or concurrent work.

Fix: enforce an aggregate byte budget while streaming, reduce bulk limits, bound processing concurrency, and use direct/staged uploads for large files. Test memory behavior in an isolated load environment, including rejected image uploads that reach the larger transport cap.

### A06 — Password reset commits before history and session revocation

Evidence: `src/modules/auth/services/password-reset.service.ts:193`, `src/modules/auth/services/password-reset.service.ts:218`, `src/modules/auth/services/password-reset.service.ts:221`; similar sequencing exists in `password-change.service.ts` and admin credential-reset event flows.

The reset token and new password commit first. Password-history recording runs next, and only then are old sessions revoked. If history recording fails, or the process dies after the commit, a successful credential change can leave old sessions valid. Retrying the same reset token is refused because it was already consumed. Fresh user reads in JWT validation do not compare a credential epoch, so they do not repair this gap.

Fix: commit the password, token claim, history, and session revocations in one database transaction with the email outbox record. Alternatively, increment a credential/session epoch atomically and enforce it on every token. Cache invalidation must follow commit; recovery cannot depend on an in-process event being delivered.

### A07 — In-flight reads can refill caches with data invalidated by a write

Evidence: `src/core/database/repositories/base.repository.ts:82`, `src/modules/stories/repositories/story.repository.ts:66`, `src/modules/auth/repositories/session.repository.ts:368`.

The sequence is cache miss → database read → cache set. A writer can commit and invalidate between the read and set, after which the reader stores the older value. Transaction-after-commit invalidation does not prevent this ordering. For stories, a withdrawn/deleted publication can remain publicly readable from a stale entry for the 600-second default TTL. Session-status cache refill has a related revocation window, bounded by its 30-second TTL.

Local reproduction: pause a loader after capturing a published row, invalidate its row tag, then resume; the old published row is cached after invalidation. The concurrent cache rewrite adds atomic tag deletion but does not fence database reads started before invalidation.

Fix: use generation/version fencing around cache population, or fresh authoritative reads on security-sensitive visibility/revocation paths. Add deterministic interleaving tests; sequential invalidation tests do not establish this guarantee.

### A08 — The advertised PM2 production start does not select a production environment

Evidence: `package.json` (`pm2:start:prod`), `ecosystem.config.js:38`, `ecosystem.config.js:89`, `ecosystem.config.js:117`, `.env.example:11`.

The script passes `--env production`, but the app definitions have no `env_production` block. The `deploy.production.env` block is a separate PM2 deploy setting. Starting with the copied development `.env` therefore does not activate production validation, disabled test endpoints, or production error/doc defaults merely because this script is called. The dashboard also injects an `admin123` fallback that is only rejected once production mode is actually active.

Fix: define `env_production: { NODE_ENV: 'production' }` for all three processes, remove the dashboard password fallback, and smoke-test the documented start command with missing secrets. Explicit externally supplied production environment variables can avoid this trigger; Docker already sets production mode.

### A21 — Image processing can undo a concurrent privacy change or deletion

Evidence: `src/modules/attachments/jobs/attachment.processor.ts:62`, `src/modules/attachments/jobs/attachment.processor.ts:75`, `src/modules/attachments/jobs/attachment.processor.ts:91`.

The worker reads visibility/deletion once, processes the image and uploads derivatives, then writes the captured visibility back. If a user makes the attachment private during processing, the worker can subsequently publish it and overwrite `isPublic` to true. If deletion happens during processing, objects can be recreated after the deletion cleanup. The initial fresh read protects changes made while waiting in the queue, not changes made while the job is running.

Fix: use a processing generation and a conditional finalization protocol shared with visibility/deletion changes. Keep outputs private until finalization and reconcile or remove obsolete generation outputs. Merely re-reading once immediately before upload still leaves a race; test privacy changes at each processing boundary.

## Medium-priority findings

| ID  | Evidence                                                                                                                                                                                                              | Problem, impact, and fix                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A09 | `src/core/config/validation.ts:251`, `:290`                                                                                                                                                                           | Production bcrypt policy checks raw environment values with `typeof rounds === 'number'`; real environment values are strings. A local `validate(...)` probe accepted `BCRYPT_ROUNDS='4'` in production. Pass the converted configuration to production checks or parse/check explicitly; test string environment input. Defaults are stronger, so this requires an explicit weak setting.                                                                                         |
| A10 | `src/modules/post-types/services/field-validators/text.validators.ts:79`, `src/modules/post-types/services/content.service.ts:54`                                                                                     | WYSIWYG validation checks type/length but stores the original HTML. `<img src=x onerror=alert(1)>` returns zero validation errors and can reach public `field_data`. This is a stored-XSS risk for consumers that render the rich HTML; browser execution was not demonstrated because the frontend is outside this repository. Sanitize dynamic rich-text values using the existing DOMPurify-backed approach and retain rendering defenses.                                      |
| A11 | `src/core/config/configuration.ts:34`, `src/modules/auth/services/registration.service.ts:36`, `src/modules/auth/services/password-reset.service.ts:48`                                                               | Services read `app.url`, but configuration never defines it. Verification/reset links default to `http://localhost:4040`, and some email links default to `https://kuybi.dev`; setting a conventional `APP_URL` does not wire that property. Add a validated frontend/public URL, require it in deployed environments, and verify queued URLs in a production-config smoke test.                                                                                                   |
| A12 | `src/modules/attachments/services/s3.service.ts:92`, `README.md:100`                                                                                                                                                  | S3 construction always requires static access/secret keys, despite the documented promise that non-upload features work without S3. It also bypasses the AWS default credential chain and does not support temporary credentials' session token, blocking ordinary IAM-role deployments. Use the SDK provider chain; initialize optional storage lazily or expose an explicit disabled mode with upload endpoints returning a clear unavailable response.                          |
| A13 | `src/core/idempotency/idempotency.interceptor.ts:81`, `:144`                                                                                                                                                          | Idempotency scope uses the route template, while the fingerprint omits actual parameters/query. The same user/key/body sent to `/content/news` and `/content/events` can replay the news result for the events request because both resolve to `v1/content/:postTypeSlug`. Include concrete resource parameters and relevant query/file metadata in canonical request identity. A probe confirmed identical fingerprints for different paths.                                      |
| A14 | `src/core/idempotency/idempotency.interceptor.ts:115`, `:130`                                                                                                                                                         | Business writes finish before idempotency completion is stored. A crash in between permits takeover and duplicate creation; a completion-write error enters the 5xx path and can release a key after the business change committed. Commit the durable command identity/outcome with the business write, or make the mutation itself uniquely keyed and recover its result. Heartbeats alone do not provide this guarantee.                                                        |
| A15 | `src/modules/stories/services/stories.service.ts:235`, `:254`; `src/modules/post-types/services/content.service.ts:158`; category/tag/field update paths                                                              | Manually incremented `version` columns do not enforce optimistic locking. There is no expected-version predicate or row lock around the relevant read/write pairs. Concurrent saves can overwrite unrelated fields, relation arrays, status, or version increments. Add compare-and-swap updates that return 409 on stale versions, or appropriate row locking. Serialize relationship changes; keep story snapshots in the same transaction if complete history is a requirement. |
| A16 | `src/core/queues/processors/base.processor.ts:22`, `:37`, `:52`                                                                                                                                                       | Lifecycle methods have no `@OnWorkerEvent` decorators and no explicit subscriptions/callers. Nest does not wire them by name, so the dead-letter path is inactive. Wire the events, make DLQ insertion idempotent, and correct/test terminal attempt counting against real event values. Redact reset/verification URLs before enabling the current raw `job.data` logging. [Nest documents event registration](https://docs.nestjs.com/techniques/queues).                        |
| A17 | `src/core/queues/config/queue.config.ts:74`, `:108`; `src/core/queues/processors/email.processor.ts:35`; `src/modules/attachments/jobs/attachment.processor.ts:31`                                                    | Rate limits are configured on queue registration, while workers receive only concurrency settings. Declared `timeout` job options are not an execution timeout mechanism in BullMQ. Move limits to worker options and implement cancellation/time budgets in processing. Remove or wire unused `worker.config.ts` settings. See [BullMQ rate limiting](https://docs.bullmq.io/guide/rate-limiting) and [timeouts](https://docs.bullmq.io/patterns/timeout-jobs).                   |
| A18 | `src/core/health/health.controller.ts:75`                                                                                                                                                                             | Redis failure makes `/health/ready` return a `not ready` body with HTTP 200. Probes that use HTTP success still route traffic to it. Return 503 when required dependencies are unavailable, and deliberately define whether cache-only degradation should affect readiness. Check the queue Redis DB/outbox separately from cache Redis.                                                                                                                                           |
| A19 | `src/modules/stories/repositories/story.repository.ts:102`, `:420`; `src/modules/stories/repositories/story-version.repository.ts:208`; `src/modules/stories/services/versioning/story-version-branch.service.ts:205` | Children lists have no limit; version chains perform one serial query per ancestor; branch summaries load all versions per branch just to compute count/latest. These paths grow with user-controlled data and can exhaust memory or produce high latency. Paginate children, use bounded recursive CTEs for chains, and SQL aggregates for branch summaries. Measure with representative history/relations.                                                                       |
| A20 | `src/core/config/configuration.ts:110`, `src/modules/auth/services/sessions.service.ts:54`                                                                                                                            | `JWT_REFRESH_EXPIRES_IN` is exposed but unused by refresh sessions, which read unmapped `auth.sessionDays` and default to seven days. Operators can configure a short refresh lifetime without changing actual expiry. Define one authoritative refresh/session lifetime, validate it, and test `Session.expiresAt` from environment input.                                                                                                                                        |

## Low-priority finding

**A22 — Audit summaries label capped samples as totals.** At `src/modules/audit/services/audit-query.service.ts:62` and `:89`, `totalActions` and breakdowns use at most `limit` rows. Entity-history `totalChanges` has the same issue. A user with 10,000 events can show a total of 50. Return separately queried totals/aggregates, or label the result as a recent sample and include truncation metadata.

## Architecture and code-quality assessment

Keep the modular monolith. The feature boundaries, public module barrels, entity ownership rules, dedicated repositories, explicit access policies, and worker-only job modules are useful and already backed by checks. Splitting into microservices would not resolve the findings and would make transactional security changes harder.

The principal weakness is duplicated policy semantics: live-role filtering differs between ACL and `User`; record authorization differs between stories and dynamic content; field permissions exist in the data model without a corresponding enforcement layer. Establish a small shared authorization contract for route eligibility, record scope, per-record checks, and permitted fields, then have feature policies implement it.

Cross-module transactions also expose ownership seams. Repositories centrally invalidate caches, but transaction callbacks can update several entities while only invalidating the initiating repository. Keep an explicit list of touched aggregates/dependencies, and centralize after-commit invalidation. TypeScript return types should distinguish cached plain data from hydrated entities; `as unknown as Attachment` in story enrichment and casts of plain objects to entities conceal which methods/fields exist at runtime.

The in-process event bus waits for subscribers and propagates errors, but a subscriber failure does not undo a previously committed publisher write. Use atomic database operations for security state and a durable outbox for required external consequences. Best-effort audit storage is a documented design choice; for security-critical administrative changes, decide whether audit persistence must commit with the mutation and provide independent alerting for audit failures.

Other operational details to clean up:

- PM2 uses `wait_ready: true` without a matching `process.send('ready')`, and its 5-second kill timeout is shorter than the application's 30-second graceful shutdown budget. Test rolling reloads and align those settings.
- The outbox relay holds PostgreSQL row locks while serially awaiting up to 50 Redis queue adds, with unbounded Redis retries configured. A Redis outage can prolong transactions and shutdown. Use a bounded dispatch connection/time budget and test outage recovery; do not weaken at-least-once delivery guarantees.
- Tracing starts after static imports of `AppModule` and its dependency tree. Verify auto-instrumentation actually patches Express/Postgres in the built CommonJS entry point; a preload tracing entry point is easier to reason about.
- Post-content cached author projections do not declare user-row dependencies as story caches do, so author renames can stay stale until content TTL expiration.
- Configuration validation covers only part of the operational settings and validates `DB_USER` while runtime reads `DB_USERNAME`. Align names, port/range/boolean validation, and documented defaults. Add TLS/provider-chain options where the target infrastructure requires them.
- Avoid representing future capabilities as active controls: several registered queues have no consumer, worker configuration is unused, and some comments still describe incomplete phases. Document implemented behavior and remove dead configuration.

## Performance work to prioritize

1. Fix upload byte/concurrency limits and unbounded reads first; they have explicit resource-growth mechanisms.
2. Measure story queries with realistic tag/category fan-out. `withRelations()` joins both collections and `search()` separately counts joined data; compare ID-page-then-hydrate queries, batch relation loading, and keyset pagination with stable ID tie-breakers.
3. Examine `ILIKE '%term%'` story/category searches with `EXPLAIN (ANALYZE, BUFFERS)` at realistic scale. Choose trigram/full-text indexes based on those plans. Do not infer a production bottleneck from small fixtures.
4. Measure authentication queries and latency with multiple role assignments/permissions. Fresh authorization is a useful security property; optimize the projection/query without reintroducing stale privilege caches.
5. Measure unique dynamic-field checks under concurrent writers: one advisory lock per post type plus per-field JSONB scans intentionally serializes those writes. Add indexes or an indexed unique-value registry only when volume justifies it.

## Suggested remediation order and acceptance conditions

| Order | Work                 | Acceptance condition                                                                                                                                                                                                 |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | A01–A03 and A08      | Inactive/deleted roles, own-record conditions, and field restrictions deny forbidden operations; the documented PM2 production command fails on missing secrets                                                      |
| 2     | A04–A07 and A21      | Upload bytes are immutable after verification, request memory is bounded, privacy changes win against workers, credential changes revoke access atomically, and deterministic cache-race tests pass                  |
| 3     | A09–A14 and A20      | String-based production config tests pass; real-domain email links and configured refresh expiry are verified; idempotency distinguishes resources and recovers committed results                                    |
| 4     | A15–A19 and A22      | Stale updates return 409, real worker events reach DLQ once, worker limits/timeouts apply, dependency failures produce the intended readiness status, and list/summary work stays bounded                            |
| 5     | Release verification | Repeat clean typecheck/build/lint and unit tests on the final fixed revision, run integration suites on disposable Postgres/Redis and Docker/PM2 startup/reload smoke tests, then collect baseline load measurements |

The existing unit tests provide useful regression protection but do not establish the missing cross-boundary guarantees. Prefer negative permission tests, deterministic concurrency/failure injection, and real worker/storage integration checks for these fixes.
