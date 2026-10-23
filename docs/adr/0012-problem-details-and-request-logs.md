# 0012. Errors are RFC 9457 problem details; one log line per request

- **Status:** Accepted
- **Date:** 2026-10-23
- **Supersedes:** the response shape of [0011](0011-error-codes.md) (its code catalogue stays)

## Context

Error responses used a custom envelope (`success`, `statusCode`, `error: { code,
message }`). Validation failures were a list of sentences with no field names, so a form
could not show them next to the input; throw sites added their own keys (`errors`,
`fields`, `conflicts`, `strength`, ...) and Nest's own (`error`, `statusCode`) leaked into
bodies. Development responses carried a stack trace even for a 400.

Logs wrote two ~1.7 KB lines per failed request; the filter's had its text in `context`
and no `msg`. Every 4xx was a warning, so routine 401s and 404s hid the warnings that
matter.

## Decision

**Responses**: every error is an RFC 9457 problem, `application/problem+json`
(`src/shared/errors/problem.ts`):

- standard members `type` (`urn:kuybi:problem:<code>`), `title` (one per code),
  `status`, `detail` (English, this occurrence), `instance` (the path, no query)
- extensions `code` (the `ErrorCode` catalogue of 0011), `requestId`, `timestamp`,
  `errors` (field errors) and `details` (data specific to the code)
- field errors have one shape everywhere: `{ pointer, field, code, message, params? }`
  (JSON Pointer, RFC 6901). ValidationPipe builds them (`validationExceptionFactory`),
  nested objects and arrays included, with constraint arguments in `params`
- a throw site's body contributes only `code`, `message`, `errors` (field errors) and
  `details`; anything else is dropped
- server errors show a generic `detail`; development and test add `stack` and `causes`
  (the `Error.cause` chain). Client errors never carry a stack
- clients branch on `code` and translate it (and `errors[].code` with `params`); the
  backend does not translate. Success responses keep `{ success: true, data }`
- Swagger documents every operation's errors as `ProblemDetails`
  (`src/core/http/openapi-problems.ts`)

**Logs**: one line per request, written by pino-http when the response finishes
(`src/core/logging/http-log.ts`). The filter only records the error on the response
(`setResponseError`). The line has the matched route, user, session, error code, the
real message, the duration, a sanitized request preview for 5xx and validation
failures, and for 5xx the error with its stack and causes. Levels: `info` for expected
client errors (400, 401, 404, 409, 422), `warn` for 403, 429 and slow requests
(`LOG_SLOW_REQUEST_MS`), `error` for 5xx.

## Consequences

- One documented, standard contract; generic clients and tools understand it.
- Forms map `errors[].pointer` to inputs; translations key on codes, not English text.
- Breaking change for clients of the old envelope: `error.code` is now `code`,
  `error.message` is `detail` (and `errors` for validation), `error.details` is
  `details`.
- A throw site that wants to send data must put it in `details` or field errors.

## Enforcement

- Types: `PROBLEM_TITLES` is a `Record<ErrorCode, string>`; a code without a title
  does not compile.
- Tests: `http-exception.filter.spec.ts` (shape, content type, what passes, 5xx never
  leaks), `validation.spec.ts` (pointers, codes, params), `http-log.spec.ts` (levels,
  fields, message), `openapi-problems.spec.ts`, `error-codes.integration.spec.ts`
  (content type and field errors end to end).
