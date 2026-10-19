# Go Services Inside Kuybi — Grounded Analysis

**Date:** August 29, 2026
**Status (2026-10-19):** buffers no longer travel through Redis (the image job passes the S3 key). Still true: attachment processing runs `concurrency: 5` on the default libuv pool of 4 threads, untuned, and shares the worker process with email and account-security jobs. Next step unchanged: evaluate imgproxy.

**Companion to:** [MICROSERVICES_STRATEGY.md](../archive/2025/planning/MICROSERVICES_STRATEGY.md) (archived) · [Enterprise Audit](../ENTERPRISE_AUDIT_2026-08.md)
**Question:** Which parts of Kuybi would genuinely be better in Go?

**Short answer:** **One** — media processing. And even there, the first move is to deploy an existing Go binary rather than write a service. Everything else on the 15-candidate list is either I/O-bound glue where Go buys nothing, or a problem where the real win is a _database_ choice rather than a _language_ choice.

---

## Table of Contents

- [The Filter](#the-filter)
- [Candidate Assessment](#candidate-assessment)
- [Recommendation: Media Processing](#recommendation-media-processing)
- [The Integration Boundary](#the-integration-boundary)
- [Deferred: Realtime Gateway](#deferred-realtime-gateway)
- [What Not To Build](#what-not-to-build)
- [Decision Summary](#decision-summary)

---

## The Filter

Go beats Node at exactly three things:

1. **CPU-bound work** — true parallelism across cores, no event loop to block, no GIL.
2. **Connection-bound work** — goroutines cost ~4 KB; 50k concurrent connections is routine.
3. **Memory-constrained throughput** — 10–20 MB RSS versus 150–400 MB for a Nest process.

Go does **not** beat Node at I/O-bound orchestration — calling a database, calling an API, moving JSON around. There, both languages sit idle waiting on the network, and NestJS's DI, validation, and OpenAPI generation make it the _more_ productive choice.

**So the question for each candidate is not "could this be Go?" but "is this CPU-bound, connection-bound, or memory-constrained?"** If the answer is no, a Go rewrite buys you an extra deployment target, an extra CI pipeline, a second observability integration, and a duplicated auth layer — in exchange for nothing.

`MICROSERVICES_STRATEGY.md` proposes Go for eight of fifteen services. Applying this filter, **one qualifies today and one qualifies later.**

---

## Candidate Assessment

Assessed against the actual codebase, not against the aspiration.

| #   | Candidate                  | Strategy doc says  | This analysis                  | Why                                                                     |
| --- | -------------------------- | ------------------ | ------------------------------ | ----------------------------------------------------------------------- |
| 2   | Media Processing           | Go 🔴 High         | ✅ **Build — but buy first**   | Genuinely CPU-bound; 1,168 LOC of it                                    |
| 1   | Realtime Notifications     | Go 🔴 High         | ⏸️ **Defer**                   | Connection-bound — but you have zero WebSocket code and zero users      |
| 7   | API Gateway / Rate Limiter | Go 🟡 Medium       | ❌ **Do not build**            | Kong _and_ Traefik are already configured in `infrastructure/gateways/` |
| 3   | Search & Discovery         | Go + ES 🟡         | ❌ **Language is irrelevant**  | The win is Meilisearch/ES; the Node client is fine                      |
| 12  | Analytics & Insights       | Go + ClickHouse 🟡 | ❌ **Language is irrelevant**  | The win is ClickHouse; the decision is the database                     |
| 8   | Audit & Compliance         | Go 🟡 Medium       | ❌ **Solve in-process**        | I/O-bound; needs Postgres partitioning + outbox, not a rewrite          |
| 9   | Feature Flags              | Go 🟢 Low          | ❌ **Use OpenFeature/Unleash** | Solved problem; do not build one                                        |
| 11  | Webhook Management         | Go 🟢 Low          | ❌ **Use BullMQ**              | Pure I/O with retries — exactly what you already have                   |
| 15  | Cache Warming              | Go 🟢 Low          | ❌ **Use BullMQ**              | Scheduled I/O; `@nestjs/schedule` already does this                     |
| 13  | Data Warehouse ETL         | Go or Python       | ❌ **Not yet**                 | No data warehouse exists                                                |
| 5   | Content Moderation         | Go or Python       | 🐍 **Python**                  | ML inference — belongs with `jiraiya-service`                           |
| 14  | ML Model Serving           | Python             | 🐍 **Python**                  | Already correct in the strategy doc                                     |
| 4   | Recommendations            | Elixir or Python   | 🐍 **Python**                  | Same                                                                    |
| 6   | Comments & Reactions       | Elixir 🟢 Low      | ❌ **Keep in Nest**            | Ordinary CRUD; a third runtime for CRUD is not justifiable              |
| 10  | Email Campaigns            | Elixir 🟢 Low      | ❌ **Keep in Nest**            | I/O-bound; BullMQ email queue already exists                            |

**Net: fifteen candidates → one to build now, one to defer, thirteen to drop or solve in place.**

That reduction is the actual recommendation. Each service you _don't_ build is a deployment, a Dockerfile, a CI pipeline, an auth integration, a tracing integration, an on-call surface, and a schema contract you don't have to maintain — while you still have four blocking security defects open in the core.

---

## Recommendation: Media Processing

### The evidence

This is the only workload in Kuybi that is unambiguously CPU-bound.

```
src/modules/attachments/services/image-optimization.service.ts   465 LOC
src/modules/attachments/services/image-processing.service.ts     399 LOC
src/modules/attachments/services/exif-processor.service.ts       304 LOC
                                                               ─────────
                                                               1,168 LOC
```

Per uploaded image, `AttachmentProcessor` currently performs: EXIF extraction, auto-rotate, optimize, JPEG re-encode, WebP encode, AVIF encode, and **three** thumbnail sizes (`small` 150², `medium` 300², `large` 600² — `image-processing.service.ts:37-40`), each of those potentially in JPEG + WebP + AVIF. That is up to a dozen encode passes per upload, and **AVIF encoding is one of the most expensive operations in common image processing.**

### Three concrete problems in the current implementation

**1. Thread pool oversubscription.** `attachment.processor.ts` declares `@Processor(QueueName.ATTACHMENT_PROCESSING, { concurrency: 5 })`. `sharp` dispatches to libuv's thread pool, whose default size is **4**. `grep -rn "UV_THREADPOOL_SIZE\|sharp.concurrency" src/ Dockerfile ecosystem.config.js .env.example` returns **zero hits** — nothing tunes either. Five concurrent jobs contend for four threads, and that same pool also serves `fs` and DNS for the rest of the worker.

**2. Raw buffers through Redis.** (Also filed as ARC-11 in the audit.)

```ts
interface OptimizeImageJobData   { attachmentId: string; buffer: Buffer; ... }
interface ExtractMetadataJobData { attachmentId: string; buffer: Buffer }
```

BullMQ JSON-serializes job data. A `Buffer` becomes `{"type":"Buffer","data":[137,80,78,71,...]}` — roughly **6–8× the original size**. A 5 MB upload becomes a ~35 MB Redis payload. Redis is being used as a blob store.

**3. Head-of-line blocking.** The attachment queue shares a worker process with email, SMS, session cleanup, and account security. A burst of AVIF encodes starves password-reset emails.

### The honest caveat about speed

**Go will not make individual images dramatically faster.** `sharp` is libvips (native C) and Go's `bimg` / `govips` are _the same libvips_. Per-image encode time is roughly at parity.

The wins are real but specific:

| Dimension         | Node + sharp today                                             | Go + libvips                                   |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Parallelism       | Bounded by `UV_THREADPOOL_SIZE` (4), shared with all other I/O | `GOMAXPROCS` — every core, dedicated           |
| Memory per worker | ~200–400 MB (Nest + V8 + sharp)                                | ~20–40 MB                                      |
| Isolation         | Shares a process with email/SMS/cleanup                        | Dedicated; cannot starve other queues          |
| Scaling           | Scale the whole Nest worker                                    | Scale only the encoder, on CPU-optimized nodes |
| Cold start        | ~3–5 s                                                         | ~50 ms                                         |
| Container size    | ~400 MB                                                        | ~25 MB (distroless)                            |

**Frame it correctly: this is a concurrency, isolation, and cost-of-scale win, not a raw-speed win.** Say that out loud when you present it, because someone will benchmark a single image and find no difference.

### Do this first: buy, don't build

Before writing any Go, evaluate **[imgproxy](https://github.com/imgproxy/imgproxy)** — a mature, widely deployed, open-source image processing server **written in Go**, on libvips.

It gives you, today, with no code:

- On-the-fly resize, crop, format conversion (WebP/AVIF), quality control
- Signed URLs (prevents resize-bombing)
- Direct S3 source support — reads from your bucket, no buffers anywhere
- Prometheus metrics and OpenTelemetry that plug straight into your existing stack
- A ~25 MB container

That replaces **all 1,168 LOC** and most of `AttachmentProcessor`. Your pipeline becomes: upload → S3 → store the key. Derivatives are generated on first request and cached at the CDN. You stop pre-generating nine variants of images nobody views.

**Write a custom Go service only if you need something imgproxy does not do** — EXIF-based business logic, ML-driven smart cropping, video transcoding, or a bespoke moderation hook. Given `exif-processor.service.ts` is 304 LOC, you may well have such logic. Read it before deciding.

### If you do build it

**Name:** `orochimaru-service` (transformation — fits the Naruto convention alongside `jiraiya-service`).

```
orochimaru-service/
├── cmd/server/main.go
├── internal/
│   ├── handler/          # HTTP + gRPC entry points
│   ├── processor/        # libvips wrapper — resize, encode, EXIF
│   ├── storage/          # S3 get/put
│   └── observability/    # OTel + Prometheus, matching Kuybi's collector
├── Dockerfile            # multi-stage → distroless
└── go.mod
```

**Stack:** `net/http` + chi (not Gin — see the audit's framework note), `h2non/bimg` or `davidbyttow/govips` for libvips, `aws-sdk-go-v2`, `go.opentelemetry.io/otel`, `prometheus/client_golang`.

**Non-negotiables, learned from the audit of the core:**

- CI from commit #1 — `go vet`, `staticcheck`, `go test -race`, `govulncheck`
- Config fails fast on missing secrets — do not repeat SEC-02
- `/health/live` and `/health/ready` split from day one — do not repeat ARC-07
- Multi-stage build, distroless, non-root — do not repeat ARC-06
- Ship the OTel trace context through from Kuybi so a request spans both services

---

## The Integration Boundary

This is where these projects usually go wrong, so be deliberate.

### Do not make Go speak BullMQ

BullMQ's Redis protocol is an internal implementation detail — Lua scripts, specific key layouts, its own state machine. Go bindings for it are incomplete and unmaintained. Coupling a Go service to another library's private Redis schema is a maintenance trap.

### Recommended: keep BullMQ, make the processor a thin client

```
Upload → Nest controller → S3 (raw object)
                        → BullMQ job { attachmentId, s3Key }     ← key, never bytes
                             ↓
                   AttachmentProcessor (Nest)
                             ↓  gRPC / HTTP + traceparent
                   orochimaru-service (Go)
                             ↓
                    S3 read → libvips → S3 write
                             ↓
                   returns { variants: [{key, w, h, format, bytes}] }
                             ↓
                   Processor persists metadata via AttachmentRepository
```

**Why this shape wins:**

- BullMQ keeps retries, backoff, the dead-letter queue, and Bull Board visibility — all of which already work
- Go stays stateless: no queue state, no database, no migrations
- The Go service owns exactly one responsibility: bytes in, bytes out
- Rollback is a feature flag — point the processor back at the local `ImageOptimizationService`
- Fixes ARC-11 as a side effect, because you are forced to pass keys instead of buffers
- One trace spans Nest → Go if you propagate `traceparent`

**Auth on that hop:** this is the M2M gap from audit ARC-12. Start with a shared secret in an `X-Service-Key` header over the private network, and put it behind proper mTLS or client-credentials when you build API-key auth for the core.

### Rejected alternatives

**NATS / Redis Streams between Nest and Go.** Cleaner in the abstract, but you would lose BullMQ's retry semantics and Bull Board, and you would be operating a second message bus. Revisit only if you end up with 4+ Go services.

**Go consuming S3 events directly.** Tempting, but it puts business logic outside your application and makes local development painful.

---

## Deferred: Realtime Gateway

The strategy doc rates this 🔴 High and Go is the correct language for it — goroutines at ~4 KB per connection genuinely beat Node's event loop past roughly 10k concurrent sockets.

**But `grep -rn "WebSocket\|socket.io\|@nestjs/websockets" src/` returns nothing. There is no realtime feature to make fast.** Building a WebSocket gateway before any feature needs one is speculative infrastructure.

**Trigger to revisit:** when you have a shipped realtime feature and are past ~5,000 concurrent connections, or when `@nestjs/websockets` measurably becomes the bottleneck. Below that, Nest's gateway with a Redis adapter is fine and costs you nothing to operate.

---

## What Not To Build

Worth stating explicitly, because these look attractive and are not.

**API Gateway.** You already have Kong (`infrastructure/gateways/kong/`) **and** Traefik (`infrastructure/gateways/traefik/`) configured. A hand-written Go gateway would be strictly worse than either: no plugin ecosystem, no dynamic config, no maintained TLS handling. Pick Kong or Traefik, delete the other, move on. (Note: running two gateway configs side by side is itself unresolved — worth deciding.)

**Audit service.** `AuditInterceptor` writes to Postgres through TypeORM. That path is I/O-bound; Go changes nothing. If the audit table is growing painfully, the fixes are Postgres table partitioning by month, a write-behind buffer, and periodic export to S3/OpenSearch — all in-process.

**Analytics service.** The reason "Go + ClickHouse" appeals is ClickHouse, not Go. Node's ClickHouse client is perfectly good. **Adopt the database; skip the rewrite.**

**Search service.** Same shape. The win is Meilisearch or Elasticsearch. Query them from Nest.

**Feature flags, webhooks, cache warming, email campaigns.** All I/O-bound with retries — precisely the workload BullMQ and `@nestjs/schedule` already handle, with Bull Board giving you visibility you would have to rebuild.

---

## Decision Summary

| Decision                    | Verdict                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| Should Kuybi use Go at all? | **Yes — for one narrow workload**                                             |
| Which workload?             | Media/image processing                                                        |
| First action                | **Evaluate imgproxy** (Go, off-the-shelf) before writing anything             |
| If custom is needed         | `orochimaru-service` — Go + chi + libvips, stateless, gRPC/HTTP behind BullMQ |
| Integration pattern         | Nest keeps the queue; Go is a stateless transform called by the processor     |
| Realtime gateway            | Defer until a realtime feature exists and exceeds ~5k connections             |
| Other 13 candidates         | Drop, or solve in-process                                                     |
| Sequence                    | **After** Tier 0 + Tier 1 of the enterprise audit                             |

### Ordering matters

Do not start this before the audit's Tier 0. Adding a second runtime while the core has an exploitable auth bypass (SEC-01), a default JWT secret (SEC-02), and no CI (ARC-03) means you now have **two** services with those problems — the Go service will need its own auth integration against the same broken JWT layer.

**Sequence:** Tier 0 security fixes → CI → fix ARC-11 (keys, not buffers, in job payloads) → evaluate imgproxy → build Go only if imgproxy falls short.

That ARC-11 fix is worth calling out: it is required _anyway_ for correctness, it is a small change, and it is the precondition that makes the Go extraction almost mechanical afterwards. It is the highest-leverage single item on this page.

---

_Analysis performed against commit `4263c80`._
