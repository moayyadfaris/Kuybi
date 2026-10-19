# Kuybi backend architecture

Current as of October 2026. Decisions and their reasons are in the
[decision records](../adr/README.md); this page describes the system as it is and links
to them. Documents describing earlier designs are in [docs/archive](../archive/2025/README.md).

## Shape

A **modular monolith** ([ADR 0001](../adr/0001-modular-monolith-shared-schema.md)):
one NestJS 12 codebase, one PostgreSQL database, one Redis, deployed as two processes
from the same image.

| Process | Entry                            | Runs                                                                             |
| ------- | -------------------------------- | -------------------------------------------------------------------------------- |
| API     | `src/main.ts` → `AppModule`      | HTTP (`/api/v1/*` admin and app API, `/api/web/v1/*` public web API, `/metrics`) |
| Worker  | `src/worker.ts` → `WorkerModule` | BullMQ processors and schedulers, the outbox relay                               |

## Layers

```
src/
  shared/          framework-free utilities, DTO helpers, decorators     (depends on nothing)
  core/            cross-cutting services: cache, config, events,        (depends on shared)
                   outbox, idempotency, queues, health, logging,
                   observability, sentry, throttling, shutdown
  infrastructure/  adapters to external systems: email, S3, SMS          (depends on shared, core)
  modules/<name>/  feature modules (below)
  database/        data source, entity list, migrations, seed scripts    (composition root)
  app.module.ts, worker.module.ts, app.setup.ts                          (composition roots)
```

Base layers never depend on feature modules
([ADR 0002](../adr/0002-base-modules-never-depend-on-features.md)).

## Feature modules

| Module                            | Owns                                        | Notes                                                                                                                           |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `acl`                             | roles, permissions, role assignments        | CASL abilities, guards; base module (depends on no feature)                                                                     |
| `users`                           | users, email verifications                  | profiles, admin user management, role assignment                                                                                |
| `auth`                            | sessions, password resets, password history | login, JWT (session-bound), lockout, password policy, token blacklist                                                           |
| `audit`                           | audit logs                                  | append-only audit trail                                                                                                         |
| `attachments`                     | attachments                                 | multipart and direct-to-S3 uploads, image processing, visibility ([ADR 0009](../adr/0009-attachment-visibility-and-uploads.md)) |
| `stories`                         | stories, story versions                     | publishing workflow, versioning (branch, merge, rollback)                                                                       |
| `categories`, `tags`, `countries` | their tables                                | taxonomy and reference data                                                                                                     |
| `post-types`                      | post types, field definitions, content      | dynamic content types with per-field validation                                                                                 |
| `web`                             | none                                        | public read API over stories and categories                                                                                     |

Each module exposes `index.ts` (its public API) and `entities/index.ts`. Inside a module:
`controllers/` → `services/` → `repositories/` → TypeORM, with `dto/`, `jobs/`,
`seeders/` as needed.

## Rules and how they are enforced

| Rule                                                                                                                                       | Enforced by                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Cross-module imports only through `@modules/<name>` or `@modules/<name>/entities`                                                          | ESLint `import-x/no-restricted-paths`   |
| No service-level cycles between modules                                                                                                    | `scripts/check-module-graph.js` (CI)    |
| A module registers only its own entities (`forFeature`)                                                                                    | `scripts/check-module-graph.js` (CI)    |
| `shared`/`core`/`infrastructure` and `acl` never import feature modules                                                                    | ESLint                                  |
| Only repositories touch TypeORM; transactions via `<repository>.transaction()` ([ADR 0003](../adr/0003-data-access-and-cache-contract.md)) | ESLint                                  |
| Repositories cache only through `cached()` / `cacheSet()`                                                                                  | ESLint                                  |
| Controllers return the payload, never their own envelope ([ADR 0008](../adr/0008-one-http-pipeline.md))                                    | ESLint                                  |
| No `any` in `src`, zero lint warnings                                                                                                      | ESLint (`--max-warnings=0`)             |
| Schema matches migrations                                                                                                                  | test setup schema-drift check (CI)      |
| Coverage does not drop                                                                                                                     | `scripts/check-coverage.js` floors (CI) |

## Request pipeline

`configureApp()` (`src/app.setup.ts`) defines it once, for the API and the integration
tests: trust-proxy setting, helmet, CORS, the `/api` prefix, compression, the global
`ValidationPipe`, `HttpExceptionFilter` (the only global filter), and the interceptors
(request id, Sentry context, logging context, `TransformInterceptor`).

- Success: `{ success: true, data, requestId }`. Errors:
  `{ success: false, statusCode, path, timestamp, requestId, error: { message, ... } }`.
- Authentication: `JwtAuthGuard`; access tokens carry the session id and are checked
  against the session on every request. Authorization: `AbilityGuard` +
  `@CheckAbility` for the route, then per-record checks with `asSubject()` in services.
- Rate limits: `@nestjs/throttler` with Redis storage (shared across instances).
- Retried unsafe requests: `@Idempotent()` and the `Idempotency-Key` header
  ([ADR 0005](../adr/0005-idempotency-keys.md)).

## Data and caching

PostgreSQL through TypeORM 1.x; schema changes only through migrations in
`src/database/migrations`. Redis caches repository reads under one cache contract (row
tag, list tag, entity tag; invalidation after commit), see
[ADR 0003](../adr/0003-data-access-and-cache-contract.md). Cache hits are plain JSON.

## Background work

- Queues: BullMQ on Redis (`core/queues`): email, attachment processing, account
  security, session cleanup, version cleanup, dead letter.
- Jobs that must follow a commit are written to the **outbox** in the same transaction
  and relayed to BullMQ by the worker ([ADR 0004](../adr/0004-transactional-outbox.md)).
- Recurring jobs use BullMQ job schedulers (`upsertJobScheduler`), so schedule changes
  take effect on deploy.
- Cross-module reactions use domain events through `EventBus`, in process for now
  ([ADR 0006](../adr/0006-domain-events-in-process.md); broker decision open).

## Configuration

`ConfigModule` with `core/config/configuration.ts` and validation in
`core/config/validation.ts`. Security defaults fail closed outside `development` and
`test` ([ADR 0007](../adr/0007-fail-closed-configuration.md)). Deployed environments must
set `JWT_SECRET`, `DB_PASSWORD`, `CORS_ORIGIN`, and `TRUST_PROXY` when behind a proxy.

## Observability

Structured logs (Pino) with request ids, Prometheus metrics at `/metrics` (including
outbox gauges and alerts), OpenTelemetry tracing, Sentry for 5xx errors (no PII or bodies
sent), health checks at `/api/health`.

## Testing

| Suite       | Command                    | Uses                                                                                                                           |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | `npm run test:unit`        | no database or Redis                                                                                                           |
| Integration | `npm run test:integration` | real PostgreSQL (schema rebuilt from migrations) and Redis db 15; HTTP specs use the production pipeline (`createHttpTestApp`) |

CI runs lint, typecheck (src and tests), build, both suites with coverage floors, a
production dependency audit and the Docker build on every pull request.
