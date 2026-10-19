# 0007. Configuration fails closed outside development and test

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Security-relevant defaults were written as `env !== 'production'`. Staging, a typo such
as `NODE_ENV=prod`, or an unset variable therefore got development behaviour: stack
traces and raw error messages in responses, Swagger on, and the production secret checks
skipped (placeholder JWT secret, missing database password).

## Decision

- `NODE_ENV` must be one of `development`, `test`, `staging`, `production`; anything
  else fails validation at boot.
- `isLocalEnvironment(env)` (`shared/utils/environment.ts`) is the only place that decides
  "local": `development` or `test`. Every security-relevant default keys off it, so any
  other environment, including one nobody planned for, gets the strict setting.
- Outside local environments the app refuses to boot without a real `JWT_SECRET`
  (at least 32 characters, not a placeholder), `DB_PASSWORD`, and an explicit
  `CORS_ORIGIN` (no `*`; the API sends credentials). Error details (5xx messages, stack
  traces) are never exposed, and Swagger is opt-in (`SWAGGER_ENABLED=true`).
- `TRUST_PROXY` names the proxies whose `X-Forwarded-For` may set `req.ip`; unset trusts
  none. Client IPs are read only through `clientIp(req)`.

## Consequences

- A misconfigured deployment stops at boot instead of running insecurely.
- Each deployed environment must set these variables explicitly.

## Enforcement

- Config validation (`core/config/validation.ts`) and its unit tests.
- Review: never write `env !== 'production'` for a security default.
