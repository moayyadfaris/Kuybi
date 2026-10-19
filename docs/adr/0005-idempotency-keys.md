# 0005. Idempotency keys for retried unsafe requests

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Mobile and web clients retry requests on timeouts. For a `POST` that creates something
(an upload, a story) a retry after a lost response creates a duplicate. Uniqueness
constraints cannot help when the duplicate is legitimate data.

## Decision

- Endpoints marked `@Idempotent()` accept an `Idempotency-Key` header. The key is scoped
  per user and route; the request body's SHA-256 fingerprint is stored with it.
- The first request with a key claims it (a unique `(scope, key)` index decides races:
  exactly one concurrent request proceeds). Its response is stored for 24 hours and
  replayed to any retry with the same key and body (header `Idempotent-Replayed: true`).
  The same key with a different body answers 422; a retry while the first request is
  still running answers 409; a 5xx releases the key so the retry runs.
- An in-progress claim holds a **lease** of 60 seconds, renewed by an in-process
  heartbeat every 20 seconds. A retry may take over only an expired lease (the owner
  crashed). Staleness is computed on the database clock, and a `lockId` fencing token
  stops a resurrected original request from overwriting the new owner's result.
- Requests without the header behave as before.

## Consequences

- Safe retries for clients that send the header; the front end must generate and resend
  the key per logical operation.
- One extra database round trip per idempotent request; a table to prune (expired keys).

## Enforcement

- Tests: `test/integration/idempotency/` (claim, replay, body mismatch, lease takeover,
  fencing) and the interceptor unit tests.
- CORS allows the `Idempotency-Key` header (`configureApp`).
