# 🦊 Kuybi

> _"Within you is the power of the Nine-Tails"_: inspired by Naruto's Kurama (Kuybi)

**Kuybi** is an open-source NestJS backend for content-driven products. It provides
authentication with sessions, role-based access control, user-defined content types,
stories with versioning, media uploads, audit logging, background jobs and built-in
observability.

🌐 **Project page:** [moayyadfaris.com/open-source/kuybi](https://moayyadfaris.com/open-source/kuybi)

[![CI](https://github.com/moayyadfaris/Kuybi/actions/workflows/ci.yml/badge.svg)](https://github.com/moayyadfaris/Kuybi/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12-E0234E.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg)](https://redis.io/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing and CI](#testing-and-ci)
- [Deployment](#deployment)
- [Observability](#observability)
- [Security](#security)
- [Upgrading](#upgrading)
- [Documentation](#documentation)
- [License](#license)
- [Contact](#contact)

---

## Features

| Area                | What you get                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**  | JWT access tokens with opaque, hashed refresh tokens; multi-device sessions; logout and token revocation; forced password change; account lockout                                                                     |
| **Access control**  | Roles and permissions (CASL), including ownership rules ("update own story") and time-limited role assignments                                                                                                        |
| **Dynamic content** | Define post types and their fields (28 field types, from text and currency to repeaters and relations) and validate content against them                                                                              |
| **Stories**         | Stories with categories, tags, media, publishing workflow and full version history                                                                                                                                    |
| **Public web API**  | Unauthenticated, rate-limited read API (`/api/web/v1`) that returns allowlisted fields only                                                                                                                           |
| **Media**           | Direct-to-S3 uploads (presigned POST, verified on completion; bytes never pass through the API) or uploads through the API; content-verified file types, EXIF stripping, responsive WebP/AVIF variants and thumbnails |
| **Audit**           | Searchable audit trail of user and admin actions                                                                                                                                                                      |
| **Background jobs** | BullMQ queues processed by a separate worker, fed by a transactional outbox (jobs commit with the data that causes them); dead-letter queue and Bull Board dashboard                                                  |
| **Safe retries**    | Create endpoints (stories, uploads, content) accept an `Idempotency-Key` header: a retry with the same key returns the original result instead of creating a duplicate                                                |
| **Email**           | Verification, password reset and notification emails from Handlebars templates                                                                                                                                        |
| **Observability**   | Structured Pino logs with request IDs, OpenTelemetry tracing, Prometheus metrics, Sentry error tracking, liveness/readiness health checks                                                                             |
| **Operations**      | Graceful shutdown for the API and worker, production Docker image, PM2 config                                                                                                                                         |

---

## Quick start

**Prerequisites:** [Node.js 24](https://nodejs.org/) (the repo pins it in `.nvmrc`) and
[Docker](https://www.docker.com/) for the local PostgreSQL and Redis.

```bash
git clone https://github.com/moayyadfaris/Kuybi.git
cd Kuybi

nvm use                     # Node 24 from .nvmrc
npm ci

cp .env.example .env        # defaults work with the local docker compose services
docker compose up -d        # PostgreSQL 16 + Redis 7

npm run migration:run
npm run db:seed:acl         # roles and permissions - must run before users
npm run db:seed:countries
npm run db:seed:users       # creates the default admin

npm run start:dev           # API on http://localhost:4040
```

Optional, in separate terminals:

```bash
npm run start:worker:dev     # background job worker (emails, image processing, ...)
npm run start:dashboard:dev  # Bull Board queue dashboard on http://localhost:4050
```

Then open:

| URL                              | What                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| http://localhost:4040/api/docs   | Swagger UI (disabled in production)                        |
| http://localhost:4040/api/health | Health check (database, Redis, memory, disk)               |
| http://localhost:4040/metrics    | Prometheus metrics                                         |
| http://localhost:4050            | Bull Board (`BULL_BOARD_USERNAME` / `BULL_BOARD_PASSWORD`) |

Default admin: **`admin@kuybi.dev` / `Admin@123`**. Change it immediately outside local
development.

> **File uploads** need an S3 bucket (`S3_*` variables). Everything else works without one.

---

## Configuration

All configuration comes from environment variables; [`.env.example`](./.env.example)
documents every option. The important ones:

| Variable                                                                            | Notes                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`                       | PostgreSQL connection                                 |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`                                        | Cache (`REDIS_DB`) and queues (`REDIS_QUEUE_DB`)      |
| `JWT_SECRET`                                                                        | **Required.** Generate with `openssl rand -base64 48` |
| `CORS_ORIGIN`                                                                       | Comma-separated list of allowed origins               |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BASE_URL` | Attachment storage                                    |
| `SMTP_*`                                                                            | Outgoing email                                        |
| `BULL_BOARD_PASSWORD`                                                               | **Required** to start the dashboard                   |
| `SWAGGER_ENABLED`                                                                   | Defaults to on outside production, off in production  |
| `SENTRY_DSN`, `OBSERVABILITY_*`                                                     | Error tracking and tracing                            |

**In production (`NODE_ENV=production`) the API refuses to start** if `JWT_SECRET` is
missing, shorter than 32 characters or a placeholder, or if `DB_PASSWORD` is missing.

---

## Project structure

```
src/
├── main.ts, app.module.ts         API entry point and root module
├── worker.ts, worker.module.ts    queue worker entry point and root module
├── dashboard.ts                   Bull Board entry point
├── database/                      the app's schema: entity list, DataSource, migrations,
│                                  seed and migration scripts
├── modules/<name>/                feature modules: auth, users, acl, stories, post-types,
│   ├── index.ts                   attachments, categories, tags, countries, audit, web
│   ├── entities/index.ts          (each with a public API, see below)
│   └── jobs/                      queue processors, loaded only by the worker
├── core/                          cross-cutting framework code: config, cache, events,
│                                  auth guards, queues, health, logging, observability
├── infrastructure/                external services (email)
└── shared/                        framework-free DTOs, filters, pipes, utilities
test/
├── unit/                          unit tests (no database needed)
├── integration/                   integration tests (PostgreSQL + Redis)
├── factories/                     test data factories
└── helpers/                       shared test infrastructure
```

**Dependency rules** (enforced in CI by `npm run lint:check` and `npm run check:module-graph`):

- `shared/` depends on nothing above it; `core/` and `infrastructure/` never import
  feature modules or `database/`.
- A module imports another module only through its public API: `@modules/<name>`
  (`index.ts`) or `@modules/<name>/entities`. Everything else in a module is internal.
  Add a symbol to `index.ts` deliberately when another module needs it.
- When a lower layer or another module must react to something, publish a domain
  event (`core/events`) instead of importing the reacting module. Modules must not
  depend on each other in a cycle (`npm run check:module-graph`, also in CI).
- Tests may import internals.

---

## Testing and CI

| Command                                                                           | What it runs                                             | Needs              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| `npm run test:unit`                                                               | Unit tests                                               | nothing            |
| `npm run test:integration`                                                        | Integration tests against a real database                | PostgreSQL + Redis |
| `npm run test:unit:cov`, `npm run test:integration:cov`, `npm run coverage:check` | Coverage for each suite, then the combined coverage gate | PostgreSQL + Redis |
| `npm run typecheck`                                                               | TypeScript type check                                    | nothing            |
| `npm run lint:check`                                                              | ESLint                                                   | nothing            |

Integration tests use a separate database configured in `.env.test` (copy
[`.env.test.example`](./.env.test.example); `TEST_DB_*`, `TEST_REDIS_*`). They drop the schema, rebuild it with the real migrations, and hold a
lock on it for the whole run, so a second concurrent run stops immediately instead of
corrupting the first. Setup fails if the migrations and the entities disagree.
Tests may only rely on the variables in `.env.test.example`, which CI sets too: a test
that passes only with your local `.env` will fail in CI.

**Changing the schema:** edit the entity, then generate a migration from the difference
and commit both:

```bash
npm run migration:generate src/database/migrations/AddStoryPinnedFlag
npm run migration:run
```

**CI** ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs on every pull
request and push to `main`. All jobs must pass:

- lint, typecheck, unit tests and build
- migrations and seeders on a clean database, then integration tests with PostgreSQL and Redis services
- combined unit + integration coverage above the floor in
  [`scripts/check-coverage.js`](./scripts/check-coverage.js) (raise it as coverage grows)
- `npm audit` of production dependencies at high severity
- the production Docker image builds

---

## Deployment

### Docker

The [`Dockerfile`](./Dockerfile) builds a multi-stage production image that runs as a
non-root user, with `tini` forwarding signals for graceful shutdown and a health check on
`/api/health/live`.

```bash
docker build -t kuybi .

docker run --env-file .env.production -p 4040:4040 kuybi                    # API
docker run --env-file .env.production kuybi node dist/worker.js             # worker
docker run --env-file .env.production -p 4050:4050 kuybi node dist/dashboard.js  # dashboard
```

Run migrations as a release step before starting the new version. The image contains only
`dist`, so use the compiled entry points:

```bash
docker run --env-file .env.production kuybi npm run migration:run:prod
docker run --env-file .env.production kuybi npm run db:seed:acl:prod   # idempotent; adds permissions introduced by new releases
```

### PM2

[`ecosystem.config.js`](./ecosystem.config.js) starts the API, worker and dashboard
(`npm run pm2:start:prod`). See the [PM2 guide](./docs/deployment/PM2_GUIDE.md).

---

## Observability

- **Logs:** structured JSON via Pino, with a request ID (`x-request-id`) on every request
  and sensitive fields redacted
- **Tracing:** OpenTelemetry, exported over OTLP (`OBSERVABILITY_*` variables)
- **Metrics:** Prometheus at `/metrics`
- **Errors:** Sentry when `SENTRY_DSN` is set
- **Health:** `/api/health` (full), `/api/health/live` (liveness), `/api/health/ready`
  (readiness)

A local Jaeger + Prometheus + Grafana stack is available:

```bash
docker compose -f docker-compose.observability.yml up -d
```

---

## Security

- **Passwords** are bcrypt-hashed and never selected by default, so they cannot leak
  through queries, relations or the cache.
- **Uploads** are verified by file content (magic numbers), not the client's declared
  type. SVG and XML are rejected, and oversized files are refused while streaming.
- **The public web API** returns explicitly allowlisted fields only.
- **Rate limits** apply to authentication endpoints and the public API.
- **Security headers** are set with Helmet, and production refuses to start with weak or
  missing secrets.
- `npm run security:scan-uploads` lists stored attachments with executable content types
  (read-only).

What is and is not applied is documented in
[docs/features/security/VALIDATION.md](./docs/features/security/VALIDATION.md). User-supplied
rich text (WYSIWYG fields, story details) is stored as submitted and must be escaped or
sanitized by the client that renders it.

To report a vulnerability, email **moayyadzf@gmail.com** rather than opening a public
issue.

---

## Upgrading

Recent releases moved to **Node.js 24**, **NestJS 12** and **TypeScript 6**. After pulling:

```bash
nvm install 24 && nvm use
npm ci
npm run db:seed:acl   # new content and ownership permissions
```

Also clear the story cache in Redis once after upgrading, since entries cached by older
releases contain full author records.

---

## Documentation

More in [`docs/`](./docs):

- **API:** [Endpoints](./docs/API_ENDPOINTS.md) · [Reference](./docs/API_REFERENCE.md) ·
  [Super admin access](./docs/SUPER_ADMIN_ACCESS.md)
- **Architecture:** [Standards](./docs/architecture/ARCHITECTURE_STANDARDIZATION.md) ·
  [Repository pattern](./docs/architecture/REPOSITORY_PATTERN.md) ·
  [Queues](./docs/architecture/BULL_QUEUE_ARCHITECTURE.md)
- **Features:** [Auth](./docs/features/auth/) · [Access control](./docs/features/acl/README.md) ·
  [Audit](./docs/features/audit/README.md) · [Attachments](./docs/features/attachments/) ·
  [Post types](./docs/features/post-types/) · [Cache](./docs/features/cache/) ·
  [Logging](./docs/features/logging/)
- **Operations:** [Graceful shutdown](./docs/deployment/GRACEFUL_SHUTDOWN.md) ·
  [PM2](./docs/deployment/PM2_GUIDE.md) ·
  [Integration testing](./docs/testing/INTEGRATION_TESTING_SETUP.md)

---

## License

Kuybi is licensed under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) for
attribution.

---

## Contact

- **Project page:** [moayyadfaris.com/open-source/kuybi](https://moayyadfaris.com/open-source/kuybi)
- **Email:** [moayyadzf@gmail.com](mailto:moayyadzf@gmail.com)
- **Issues:** [GitHub Issues](https://github.com/moayyadfaris/Kuybi/issues)

<div align="center">

_Harness the power of the Nine-Tails_ 🦊

</div>
