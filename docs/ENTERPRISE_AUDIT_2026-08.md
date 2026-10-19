# Kuybi — Enterprise Readiness Audit

**Date:** August 29, 2026
**Scope:** `kuybi/` core service
**Baseline:** 347 TypeScript files, ~47,850 LOC, 142 commits, NestJS 11.1 / TypeScript 5.9 / PostgreSQL 16 / Redis 7
**Verdict:** Substantial and genuinely capable application. **Not yet a reusable enterprise core.** Four blocking security defects, 86 production dependency vulnerabilities, no CI, and domain code welded into the core.

> ## Status at 2026-10-19
>
> Verified against `main` after Phase 6. The audit below is unchanged; this table records what has happened since.
>
> | Finding                               | Status                                                                                                                                                                       |
> | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | SEC-01 temp-token bypass              | ✅ Fixed: `JwtStrategy` scopes `tempPasswordChange` tokens to `@AllowPasswordChangeToken()` routes                                                                           |
> | SEC-02 JWT secret fallback            | ✅ Fixed: no fallback; config fails closed outside dev/test ([ADR 0007](adr/0007-fail-closed-configuration.md))                                                              |
> | SEC-03 shared refresh key             | ➖ Not applicable: refresh tokens are opaque random secrets (hashed in `sessions`), not JWTs                                                                                 |
> | SEC-04 helmet                         | ✅ Fixed (`configureApp`)                                                                                                                                                    |
> | SEC-05 Bull Board credentials         | ✅ Fixed: refuses to start without `BULL_BOARD_PASSWORD`; checked outside dev/test                                                                                           |
> | SEC-06 86 production vulnerabilities  | ✅ Fixed: `npm audit --omit=dev` reports 0; CI audits every PR                                                                                                               |
> | SEC-07 password hashing               | ❌ Open: bcrypt cost hard-coded to 10 at 9 call sites; no shared hasher or rehash-on-login                                                                                   |
> | SEC-08 repo hygiene                   | ✅ Fixed: `.dockerignore` extended; `integration_test_output.txt` removed and `*_output.txt` ignored                                                                         |
> | Dependencies (majors)                 | ✅ Mostly: CASL 7, Nodemailer 10, bcrypt 6, Jest 30, ESLint 10 (flat config), BullMQ 6, Bull Board 9, TypeORM 1.1. Blocked: ioredis 6 (TypeORM peer), TypeScript 7 (tooling) |
> | Dead / misplaced dependencies         | ❌ Open: `morgan`, `ajv`, `ajv-formats`, `rimraf` unused; 3 `@types/*` in `dependencies`                                                                                     |
> | Manifest metadata                     | 🟡 Partly: `LICENSE`, `license`, `engines`, `.nvmrc` exist; no `SECURITY.md`                                                                                                 |
> | ARC-01 domain in core                 | 🟡 Entity list moved to the `src/database` composition root; a reusable-core split was not pursued ([ADR 0001](adr/0001-modular-monolith-shared-schema.md))                  |
> | ARC-02 package boundary               | ➖ Not pursued: modular monolith with lint-enforced boundaries ([ADR 0001](adr/0001-modular-monolith-shared-schema.md))                                                      |
> | ARC-03 CI                             | ✅ Fixed: lint, typecheck, unit + integration with coverage floors, audit, Docker build on every PR                                                                          |
> | ARC-04 type safety                    | ✅ Mostly: all strict flags except `strictPropertyInitialization` (checked by a script); no `any` in `src`; target ES2017 kept on purpose                                    |
> | ARC-05 tests                          | 🟡 Improving: 339 unit + 288 integration; coverage lines 62.9%, branches 45.7% (floors 60 / 43)                                                                              |
> | ARC-06 Dockerfile                     | ✅ Fixed: multi-stage, `npm ci` + prune, non-root, tini, `HEALTHCHECK`                                                                                                       |
> | ARC-07 health                         | ✅ Fixed: `/api/health/live`, `/api/health/ready`, combined `/api/health`                                                                                                    |
> | ARC-08 transactions                   | ✅ Fixed: multi-write flows run in `<repository>.transaction()` ([ADR 0003](adr/0003-data-access-and-cache-contract.md))                                                     |
> | ARC-09 API versioning                 | ❌ Open (path-based `v1` only)                                                                                                                                               |
> | ARC-10 idempotency, outbox            | ✅ Fixed ([ADR 0004](adr/0004-transactional-outbox.md), [ADR 0005](adr/0005-idempotency-keys.md))                                                                            |
> | ARC-11 buffers in job payloads        | ✅ Fixed: the image job passes the S3 key (two unused buffer job handlers remain to delete)                                                                                  |
> | ARC-12 tenancy, i18n, flags, M2M auth | ❌ Open (product decisions)                                                                                                                                                  |
> | ARC-13 documentation sprawl           | 🟡 Partly: [decision records](adr/README.md), [architecture overview](architecture/README.md), 2025 archive; feature docs not yet reviewed                                   |

---

## Table of Contents

- [1. Security Findings](#1-security-findings)
- [2. Dependency Health](#2-dependency-health)
- [3. Architecture Gaps](#3-architecture-gaps)
- [4. Enrichment Roadmap](#4-enrichment-roadmap)
- [5. Framework Decision Review](#5-framework-decision-review)
- [6. Summary Scorecard](#6-summary-scorecard)

---

## 1. Security Findings

Severity is assigned by exploitability against a default production deployment.

### 🔴 SEC-01 — `forcePasswordChange` gate is bypassable (privilege escalation)

**Files:** `src/modules/auth/services/auth.service.ts:200`, `:551-560`; `src/modules/auth/strategies/jwt.strategy.ts`

A user flagged `forcePasswordChange` is denied a session, but is handed a `tempAccessToken` carrying a `tempPasswordChange: true` claim:

```ts
// auth.service.ts:551
private async generateTempAccessToken(user: User) {
  const payload = { sub: user.id, email: user.email,
                    role: user.getPrimaryRoleName(),
                    tempPasswordChange: true }   // <-- set, never read
  return this.jwtService.signAsync(payload, { expiresIn: '15m' })
}
```

`grep -rn "tempPasswordChange" src/` returns **one** hit — the assignment above. `JwtStrategy.validate()` verifies signature, blacklist status, and `isActive`, then returns the full `User`. It never inspects the claim.

**Impact:** The token issued _specifically because_ the user is not allowed in is a fully-privileged access token for every authenticated endpoint, for 15 minutes. The entire forced-password-change control is decorative.

**Fix:**

1. In `JwtStrategy.validate()`, read `payload.tempPasswordChange`.
2. If set, attach a marker to the returned principal (e.g. `user.__scope = 'password-change'`).
3. Add a global guard that rejects any request from such a principal unless the handler is decorated `@AllowPasswordChangeOnly()`.
4. Add an integration test asserting the temp token returns 403 on `GET /api/v1/users/me`.

---

### 🔴 SEC-02 — JWT secret has a working default, and validation cannot reject it

**Files:** `src/core/config/configuration.ts:89`, `src/core/config/validation.ts`

```ts
// configuration.ts:89
jwtSecret: process.env.JWT_SECRET || 'change-me-kuybi-secret',
```

This fallback would be survivable if config validation caught a missing secret. It cannot — **every field in `validation.ts` is `@IsOptional()`**:

```ts
@IsString()
@IsOptional()
JWT_SECRET?: string
```

The `validate` function is wired into `ConfigModule.forRoot()` but has no rejecting constraint anywhere in the class. It validates types on values that are present and accepts every absence.

**Impact:** A production deploy missing `JWT_SECRET` boots successfully and signs tokens with a literal string committed to a public GitHub repository. Any reader of the repo can forge a token for any `sub`, including a super-admin. This is full authentication bypass on a misconfigured deploy, and nothing in the system warns you.

**Fix:** Split the env schema by `NODE_ENV`. In production make `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`, and `BULL_BOARD_PASSWORD` required with `@MinLength(32)`. Delete every secret fallback in `configuration.ts` — throw instead.

---

### 🔴 SEC-03 — Access and refresh tokens share one signing key

**Files:** `.env.example`, `src/core/config/configuration.ts`

`.env.example` declares `JWT_REFRESH_SECRET`. `grep -rn "JWT_REFRESH_SECRET\|refreshSecret" src/` returns **zero** hits. `JwtModule` is configured with a single secret; both `generateAccessToken` and the session refresh path sign with it.

**Impact:** Access and refresh tokens are cryptographically interchangeable. A leaked short-lived access token can be replayed where a refresh token is expected, collapsing the security benefit of the two-token design.

**Fix:** Introduce a distinct `auth.jwtRefreshSecret`, sign refresh tokens with `{ secret: refreshSecret }`, and verify with the matching key. Add `typ` claims (`access` / `refresh`) and assert them on verify — defence in depth against confusion even under a shared key.

---

### 🟠 SEC-04 — Helmet installed but never registered

**File:** `src/main.ts`

`helmet@^8.1.0` is a declared dependency. `grep -rn "helmet" src/` returns **zero** files.

**Impact:** No `Strict-Transport-Security`, no `X-Content-Type-Options: nosniff`, no `X-Frame-Options`, no CSP, no `Referrer-Policy`. The Swagger UI at `/api/docs` and the Bull Board at `:4050` are both framable.

**Fix:** One line in `bootstrap()`, before route registration:

```ts
app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' }))
```

---

### 🟠 SEC-05 — Bull Board ships with default credentials

**File:** `src/dashboard.ts:34-35`

```ts
const username = process.env.BULL_BOARD_USERNAME || 'admin'
const password = process.env.BULL_BOARD_PASSWORD || 'admin123'
```

**Impact:** The dashboard can inspect, retry, and delete jobs across all 12 queues. Job payloads contain email bodies, user IDs, and — see ARC-11 — raw image buffers. `admin`/`admin123` is in a public repo.

**Fix:** Fail to boot if `BULL_BOARD_PASSWORD` is unset. Bind the dashboard to loopback by default and require an explicit opt-in to expose it.

---

### 🟠 SEC-06 — 86 production dependency vulnerabilities (5 critical, 24 high)

`npm audit --omit=dev` results. The security-relevant subset:

| Severity     | Package           | Issue                                      | Why it matters here                          |
| ------------ | ----------------- | ------------------------------------------ | -------------------------------------------- |
| **critical** | `@casl/ability`   | Prototype pollution                        | This _is_ your authorization layer           |
| **critical** | `handlebars`      | JS injection via AST type confusion        | Renders your email templates                 |
| **critical** | `fast-xml-parser` | RangeError DoS                             | Under AWS SDK                                |
| **critical** | `protobufjs`      | Arbitrary code execution                   | Under OpenTelemetry                          |
| high         | `jws`             | Improperly verifies HMAC signature         | Under `passport-jwt` → your whole auth chain |
| high         | `@nestjs/core`    | Improper neutralization / injection        | Framework core                               |
| high         | `nodemailer`      | SMTP command injection via `envelope.size` | Outbound mail                                |
| high         | `multer`          | DoS via incomplete cleanup                 | File upload path                             |
| high         | `lodash`          | Code injection via `_.template`            | Transitive                                   |
| high         | `path-to-regexp`  | ReDoS via sequential optional groups       | Routing                                      |

**Fix order:** `@casl/ability` → 7.x and `handlebars` first (both critical, both on hot paths), then `jws` via `passport-jwt`/`jsonwebtoken`, then the AWS/OTel transitive set via `npm audit fix` plus SDK minor bumps.

---

### 🟡 SEC-07 — Password hashing: hardcoded cost, six call sites, no abstraction

`bcrypt` rounds are literal `10` in six places:

- `src/modules/auth/services/registration.service.ts:65`
- `src/modules/auth/services/auth.service.ts:672`
- `src/modules/auth/services/password-reset.service.ts:217`
- `src/modules/auth/services/sessions.service.ts:115`
- `src/modules/users/services/users.service.ts:81`, `:147`
- `src/modules/users/seeders/users.seeder.ts:22`

**Impact:** Cost factor 10 is below the current baseline and cannot be raised without a six-file change. There is no migration path (no stored algorithm/cost metadata), so raising it later cannot rehash existing users on login.

**Fix:** A single `PasswordHasher` service in `libs/auth`. Default to **argon2id**. Store the algorithm identifier alongside the hash and transparently rehash on successful login when the stored parameters are below current policy.

---

### 🟡 SEC-08 — Weak error-path and repo hygiene

- `integration_test_output.txt` is **tracked in git**.
- `.env.bak`, `server.log`, `test-output.log`, `dist/`, `logs/`, `coverage/` sit untracked in the working tree — noise, and `.env.bak` is a real leak risk if `.gitignore` is ever edited.
- `.dockerignore` omits `docs`, `todo-docs`, `.qodo`, `scripts` — all copied into the image by `COPY . .`.

---

## 2. Dependency Health

**28 packages a full major behind. 52 minor/patch behind.**

### Majors worth planning

| Package                | Current  | Latest | Note                                                                     |
| ---------------------- | -------- | ------ | ------------------------------------------------------------------------ |
| `typescript`           | 5.9.3    | 7.0.2  |                                                                          |
| `eslint`               | 8.57.1   | 9.39.5 | You are on legacy `.eslintrc.js`; flat config is the only supported path |
| `@typescript-eslint/*` | 6.21.0   | 8.68.0 | Two majors behind, blocks the ESLint 9 move                              |
| `@types/node`          | 20.19.24 | 26.3.0 |                                                                          |
| `@types/express`       | 4.17.25  | 5.0.6  | **Mismatched** — Nest 11 runs Express 5                                  |
| `bullmq`               | 5.62.0   | 6.2.1  |                                                                          |
| `ioredis`              | 5.8.2    | 6.0.0  |                                                                          |
| `bcrypt`               | 5.1.1    | 6.0.0  | Pairs with SEC-07                                                        |
| `@casl/ability`        | 6.7.3    | 7.0.1  | **Security — critical**                                                  |
| `nodemailer`           | 7.0.10   | 9.0.5  | **Security — high**                                                      |
| `jest`                 | 29.7.0   | 30.4.2 |                                                                          |
| `@bull-board/*`        | 6.14.0   | 9.4.0  | Three majors                                                             |
| `pm2`                  | 6.0.13   | 7.0.4  |                                                                          |
| `file-type`            | 21.0.0   | 22.0.2 |                                                                          |
| `isomorphic-dompurify` | 2.31.0   | 3.3.0  |                                                                          |
| `pino-http`            | 10.5.0   | 11.0.0 | Pinned exact — intentional?                                              |

### Dead dependencies — remove

Verified by `grep -rl <pkg> src/`:

| Package       | Uses in `src/` | Note                                           |
| ------------- | -------------- | ---------------------------------------------- |
| `helmet`      | **0**          | See SEC-04 — register it rather than remove it |
| `morgan`      | **0**          | `pino-http` already covers request logging     |
| `ajv`         | **0**          |                                                |
| `ajv-formats` | **0**          |                                                |
| `rimraf`      | **0**          | No `clean` script exists                       |

Removing `morgan`, `ajv`, `ajv-formats`, and `rimraf` drops four direct dependencies and their trees.

### Misplaced dependencies

These are in `dependencies` and belong in `devDependencies`:

- `@types/cache-manager` (also duplicated — listed in **both** blocks)
- `@types/mime-types`
- `@types/nodemailer`
- `@types/validator`

### Missing manifest metadata

`package.json` has no `license`, no `engines`, no `packageManager`. There is no `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, or `.nvmrc` in the repository. **A public repository without a license is legally unusable by anyone else** — which directly contradicts the goal of a reusable base.

---

## 3. Architecture Gaps

### ARC-01 — The core hardcodes your domain 🔴

`src/core/database/database.module.ts` imports 22 entity classes by name and lists them in a literal array — including `Story`, `StoryVersion`, `Tag`, `Category`, `PostType`, `PostContent`, `PostContentTag`, `PostContentCategory`, `PostContentAttachment`.

**Impact:** Anyone adopting Kuybi for a non-CMS product inherits your content schema or forks and strips it. This single file is the largest obstacle to the stated goal.

**Fix:** `autoLoadEntities: true`, and relocate `stories`, `tags`, `categories`, and `post-types` out of the core into a sample application.

### ARC-02 — No package boundary 🔴

One flat `src/`. No `apps/`, no `libs/`, no monorepo, no workspace. Nothing is independently versioned or publishable. `"private": true` with no license.

**Fix:** Nest monorepo layout — `apps/api`, `apps/worker`, `apps/dashboard`, and `libs/{auth,acl,audit,cache,queues,observability,shared}`. Longer term, publish as scoped packages.

### ARC-03 — No CI whatsoever 🔴

`.github/` contains exactly one file: `copilot-instructions.md`. No workflow runs build, lint, tests, or `npm audit`. No Dependabot or Renovate. For a repository presented as a best-practice reference, this is the most immediately visible gap — and it is why SEC-06 accumulated to 86 vulnerabilities unnoticed.

### ARC-04 — TypeScript's main value proposition is disabled 🟠

`tsconfig.json`:

```jsonc
"strictNullChecks": false,   // no strict, no noImplicitAny
"target": "ES2017"           // on Node 20
```

`.eslintrc.js`:

```js
'@typescript-eslint/no-explicit-any': 'off',
'@typescript-eslint/no-unused-vars': 'off',
```

`database.module.ts` even declares `const config: any = {...}`.

**Fix:** `"strict": true`, `"target": "ES2022"`. Migrate incrementally with per-file suppressions if needed, but get there — this is the difference between "written in TypeScript" and "type-safe".

### ARC-05 — Test coverage is a fiction 🟠

**18 spec files against 347 source files.** `jest.config.ts` declares:

```ts
coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } }
```

That threshold is unreachable at this file count, so `npm run test:cov` either fails or is never run. Entirely untested: `attachments`, `cache`, `queues`, `email`, `s3`, `acl` services, `web`, `countries`, `tags`, `categories`, and the shared filters/interceptors/pipes.

Also: `maxWorkers: 1` on the **unit** config serializes a suite that has no reason to be serial. Keep it on the integration config only.

### ARC-06 — Dockerfile is development-grade 🟠

```dockerfile
FROM node:20-alpine
RUN npm ci          # includes devDependencies
COPY . .            # pulls logs/, coverage/, docs/, dist/
CMD ["npm", "run", "start:dev"]   # watch-mode dev server as the default
```

No multi-stage build, runs as **root**, no `HEALTHCHECK`, no init process (so `SIGTERM` reaches npm, not node — undermining the careful graceful-shutdown code in `main.ts`).

**Fix:** builder stage → runtime stage on `npm ci --omit=dev`, `USER node`, `dumb-init` as PID 1, `HEALTHCHECK` against `/health/live`, `CMD ["node", "dist/main.js"]`.

### ARC-07 — Health endpoint is not Kubernetes-shaped 🟠

`src/core/health/health.controller.ts` exposes a single `GET /health` combining database ping, Redis, heap, RSS, disk, and optionally S3.

**Impact:** Kubernetes uses liveness to decide _restart_ and readiness to decide _route traffic_. With one combined endpoint, a transient Redis blip or a disk crossing 95% triggers pod restarts instead of a temporary removal from the load balancer.

**Fix:** `/health/live` — process responsiveness only, no dependencies. `/health/ready` — database, Redis, S3. Keep the combined view at `/health` for humans.

### ARC-08 — Transactions are nearly absent 🟠

`createQueryRunner` / `dataSource.transaction` appears **three times** in the entire `src/modules` tree:

- `stories.service.ts:77` — real
- `stories.service.ts:348` — parameter is `_transactionalEntityManager` (unused), so the callback does not use the transactional manager; this block is a transaction in name only
- `field-definition.repository.ts:209` — real

Registration writes `User` + `EmailVerification` + `UserRole`. Password reset writes `User` + `PasswordHistory` + session revocations. None are atomic. A mid-flow failure leaves partial state.

**Fix:** An `AsyncLocalStorage`-backed transaction context plus a `@Transactional()` method decorator, in `libs/shared`. Then apply it to every multi-write service method.

### ARC-09 — No API versioning primitive 🟡

`enableVersioning` / `VersioningType` are unused. Versions are string literals in controller paths (`v1/...`). Functional, but there is no deprecation header, no `Sunset` header, and no way to run two versions of one handler.

### ARC-10 — No idempotency, no outbox 🟡

Zero references to `idempoten*` or `outbox` in the codebase. Jobs are enqueued to BullMQ _outside_ the database transaction that produced the row they describe — so a crash between commit and enqueue silently drops work, and a crash between enqueue and commit dispatches a job for a row that does not exist.

These two patterns are the clearest technical marker separating a "solid CRUD backend" from an "enterprise service base". See [§4 Tier 2](#tier-2--the-features-that-earn-the-enterprise-label).

### ARC-11 — Raw buffers travel through Redis job payloads 🟠

`src/core/queues/processors/attachment.processor.ts`:

```ts
interface OptimizeImageJobData   { attachmentId: string; buffer: Buffer; ... }
interface ExtractMetadataJobData { attachmentId: string; buffer: Buffer }
```

BullMQ serializes job data to JSON into Redis. A `Buffer` becomes a `{type:'Buffer',data:[...]}` array — roughly **6–8× the original byte size** in Redis memory. A 5 MB upload becomes a ~35 MB job payload.

**Fix:** Pass the S3 key. Let the processor fetch the object. This is also a precondition for moving image work to a separate service (see the Go analysis).

### ARC-12 — No multi-tenancy, i18n, feature flags, or M2M auth 🟡

`grep -rni "tenant" src/` → 0. `grep -rn "i18n" src/` → 0. No feature-flag mechanism. Authentication is user-JWT only — there is no API-key or client-credentials path, so no service can call Kuybi without impersonating a user.

For a base intended to serve "any project" — and given a MENA/Jordan context where Arabic is not optional — these are structural absences, not nice-to-haves.

### ARC-13 — Documentation sprawl 🟡

`docs/` holds 60+ markdown files with no index, including paired `*_PLAN.md` / `*_COMPLETE.md` / `*_STATUS.md` / `*_SUMMARY.md` files for the same initiative (RBAC has **six**). `todo-docs/` duplicates part of it. `PROJECT_REVIEW.md` and `FEATURE_SUGGESTIONS.md` float at the repo root.

Also note: the README claims a **"CQRS-ready architecture"**, but `@nestjs/cqrs` is not installed and no command/query bus exists. Either build it where it earns its place or drop the claim.

**Fix:** `docs/README.md` as an index. Archive completed plans under `docs/archive/`. Adopt ADRs (`docs/adr/NNNN-title.md`) for decisions going forward.

---

## 4. Enrichment Roadmap

Ordered by value per unit of effort.

### Tier 0 — Before anything else (days)

1. Fix **SEC-01** (auth bypass), **SEC-02** (secret fallback + real validation), **SEC-03** (split refresh key), **SEC-04** (helmet), **SEC-05** (dashboard creds).
2. `npm audit fix`, then the security majors: `@casl/ability` 7, `handlebars`, `nodemailer` 9, `bcrypt` 6.
3. Add `.github/workflows/ci.yml` — lint, build, test, `npm audit --audit-level=high`, on every PR. Enable Dependabot.
4. Add `LICENSE` (MIT), `engines: { "node": ">=20" }`, `packageManager`, `.nvmrc`, `SECURITY.md`.
5. Multi-stage `Dockerfile`, non-root user, `HEALTHCHECK`, `dumb-init`.
6. `git rm --cached integration_test_output.txt`; delete `.env.bak`; extend `.dockerignore`.

### Tier 1 — Make it a core (weeks)

7. Restructure to `apps/` + `libs/`. Move `stories`/`tags`/`categories`/`post-types` to `apps/sample`. Switch to `autoLoadEntities: true`.
8. Enable `strict: true`; re-enable `no-explicit-any` and `no-unused-vars`; migrate to ESLint 9 flat config.
9. Split `/health/live` and `/health/ready`.
10. Raise test coverage to a real number — target 70% on `libs/`, starting with auth, acl, cache, queues. Set the Jest threshold to the number you actually meet, then ratchet it.
11. Extract three shared primitives into `libs/shared`: `PasswordHasher` (argon2id, configurable, self-rehashing), `@Transactional()` (AsyncLocalStorage), and a typed `AppError` hierarchy to replace scattered `HttpException` throws.
12. Fix **ARC-11** — pass S3 keys, not buffers, through queues.

### Tier 2 — The features that earn the "enterprise" label

13. **Idempotency keys.** `Idempotency-Key` header, Redis-backed response replay, scoped per user + endpoint. Non-optional for any API that will ever touch payments or orders.
14. **Transactional outbox.** An `outbox` table written inside the same transaction as the domain change, plus a relay that publishes to BullMQ. This is the single largest correctness upgrade available to you and directly fixes ARC-10.
15. **Multi-tenancy.** `tenant_id` column, request-scoped tenant context, a TypeORM subscriber that auto-scopes every query. The biggest single differentiator for a B2B backend template.
16. **API keys / machine-to-machine auth.** Required before "microservices" is accurate.
17. **i18n** via `nestjs-i18n`, with Arabic as a first-class locale.
18. **Feature flags** — OpenFeature interface, config provider to start, Unleash later.
19. **Cursor pagination.** Offset-only breaks past ~100k rows.
20. **Outbound resilience.** Promote `src/shared/utils/resilience.ts` into a real circuit breaker (Opossum) wrapping S3, SMTP, and outbound HTTP.
21. **OpenAPI contract check in CI.** Snapshot `swagger.json`; fail PRs on unintended breaking changes.
22. **RFC 9457 Problem Details** replacing the ad-hoc error envelope in `http-exception.filter.ts`.
23. **Testcontainers** replacing the docker-compose test dance, so integration tests actually run in CI.

### Tier 3 — Polish

24. Audit-log export to S3/OpenSearch; SBOM generation (CycloneDX); signed container images; `k6` performance gates in CI; ADR folder; documentation consolidation per ARC-13.

---

## 5. Framework Decision Review

**Was NestJS the right choice? Yes. Keep it.**

The stated goal — a reusable enterprise base that many projects extend — is precisely NestJS's design center. The DI container, module boundaries, guards/interceptors/pipes, and decorator metadata are exactly what let a base repository be extended by a consumer _without forking it_. You have already banked that payoff: the ACL guards, cache interceptor, audit interceptor, and transform interceptor are genuinely drop-in for any new module. That composability is the framework doing its job.

**Costs you are paying:** slower cold start and higher memory than bare Express; decorator and `reflect-metadata` indirection that obscures stack traces; boilerplate density; and TypeORM — the weakest link in the stack, semi-abandoned at 0.3.x for years. **Strongly consider Drizzle or Prisma for new work.**

### Alternatives, honestly assessed

**Hono** — genuinely faster (~3–5× on raw routing), runs on Workers/Deno/Bun. But it is a _router_, not a framework: no DI, no module system, no lifecycle hooks, no Swagger-from-types without glue. For a single edge API or a BFF, Hono wins outright. For a base that twenty projects extend, you would rebuild half of Nest, worse. **Wrong tool for this goal.**

**Go + Gin** — real wins: 5–10× throughput, ~10× lower memory, a single static binary, no `node_modules` supply chain (compare: your 86 production vulnerabilities), true parallelism, trivial containers. Real costs: thinner DI ecosystem, no CASL equivalent, a worse ORM story, and a ~48k-LOC rewrite in a language you would be learning on the job. Gin is also no longer the default enterprise choice in Go — Echo or `net/http` + chi is. **Right call only where throughput is the actual bottleneck.** See the [Go Service Analysis](./planning/GO_SERVICE_ANALYSIS.md) for where that is true inside Kuybi.

**Python + FastAPI** — the closest philosophical match: Pydantic ≈ class-validator, auto-OpenAPI ≈ your Swagger plugin, and `Depends` provides DI (function-scoped, weaker than Nest's container). Wins decisively for ML/AI workloads — which is exactly why `jiraiya-service` is already FastAPI. Costs: the GIL forces process fan-out for CPU work, packaging is messier, no module system, runtime-checked rather than compile-time typing. **Wrong for the core; correct for what you already use it for.**

### Recommendation

Stay on NestJS for the core. Keep `jiraiya-service` in Python for AI. Add Go only for specific workloads that are CPU- or connection-bound — see the companion analysis. That is a polyglot microservices architecture, and you are accidentally already in one.

**The framework is not what is holding Kuybi back.** No CI, `strict: false`, 18 tests, 86 production vulnerabilities, and an exploitable auth bypass are — and every one of those would still be true in Go, Hono, or FastAPI.

---

## 6. Summary Scorecard

| Dimension             | Rating      | Notes                                                                                    |
| --------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Feature breadth       | 🟢 Strong   | Auth, RBAC/CASL, audit, cache, queues, S3, email, observability, dynamic post types      |
| Observability         | 🟢 Strong   | OpenTelemetry, Prometheus, Sentry, Pino, correlation IDs, Grafana configs                |
| Graceful shutdown     | 🟢 Strong   | Genuinely careful in `main.ts` and `worker.ts` — undermined only by the Dockerfile `CMD` |
| Module organization   | 🟢 Good     | Clean `core` / `modules` / `shared` / `infrastructure` split with path aliases           |
| Security              | 🔴 Blocking | SEC-01 through SEC-03 are exploitable                                                    |
| Dependency hygiene    | 🔴 Blocking | 86 production vulns, 28 majors behind, 4 dead deps                                       |
| CI/CD                 | 🔴 Absent   | No workflows at all                                                                      |
| Type safety           | 🟠 Weak     | `strict: false`, `any` permitted                                                         |
| Testing               | 🟠 Weak     | 18 files / 347; unmeetable coverage gate                                                 |
| Reusability as a core | 🔴 Blocking | Domain welded into `DatabaseModule`; no package boundary; no license                     |
| Container readiness   | 🟠 Weak     | Root user, dev CMD, single stage                                                         |
| Data integrity        | 🟠 Weak     | Transactions in 3 places; no outbox; no idempotency                                      |

**Bottom line:** the hard, interesting parts — observability, queue architecture, RBAC, graceful shutdown — are done and done well. What is missing is the unglamorous discipline layer: CI, strictness, tests, dependency upkeep, and the boundary that separates "core" from "my app". Tier 0 and Tier 1 together convert Kuybi from a strong personal project into a credible enterprise base.

---

_Audit performed against commit `4263c80`._
