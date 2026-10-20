# 0011. Every error response carries a stable error code

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Error responses had a status and a human message. Clients that had to react differently
to failures with the same status (refresh an expired access token, but sign in again after
a revoked session; show a lockout timer; retry an idempotent request later) could only
compare message strings, which change with copy edits. One endpoint had invented its own
`code` field.

## Decision

- Every error response has `error.code`, a stable string from one catalogue: `ErrorCode`
  in `src/shared/errors/error-code.ts`. Codes are part of the API: added freely, never
  renamed or reused.
- `HttpExceptionFilter` sets it: the code given by the throw site
  (`new XException({ code: ErrorCode.X, message })`) if it is in the catalogue; otherwise
  `VALIDATION_FAILED` for ValidationPipe errors; otherwise the generic code of the status
  (`NOT_FOUND`, `CONFLICT`, ...).
- 5xx responses always carry `INTERNAL_ERROR` / `SERVICE_UNAVAILABLE`: a server error's body
  never decides what the client sees.
- Specific codes where clients branch: authentication (token missing, expired, invalid;
  session ended; refresh token invalid; invalid credentials; account locked or inactive;
  password change required), password change cooldown, idempotency keys.

## Consequences

- Clients can switch on `error.code`; messages are free to change.
- Throw sites that do not care keep throwing plain Nest exceptions and get the status code.
- Response shape change: `error.code` is new; nothing was removed.

## Enforcement

- ESLint: no string literal `code:` in an exception body; use `ErrorCode`.
- Tests: `http-exception.filter.spec.ts` (code selection, 5xx never leaks a code) and
  `error-codes.integration.spec.ts` (each auth code, validation, not found, idempotency).
