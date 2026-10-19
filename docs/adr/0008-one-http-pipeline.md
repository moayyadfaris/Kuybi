# 0008. One HTTP pipeline, one exception filter, one response envelope

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The production request pipeline (security headers, CORS, validation, filters,
interceptors) was assembled in `main.ts`, and each integration spec assembled its own,
different one, so tests did not exercise the API clients actually get. That hid real
defects: field validation details dropped from error responses, boolean query and form
values parsed as `true` (a private upload stored as public), and twelve endpoints
returning `{ success, data: { success, data } }`. With Sentry enabled, a second global
filter took over every error and answered in a different shape.

## Decision

- `configureApp(app)` (`src/app.setup.ts`) is the only definition of the pipeline;
  `main.ts` and every HTTP integration spec call it (tests via `createHttpTestApp` or
  directly).
- `HttpExceptionFilter` is the only global filter: one error shape
  (`{ success: false, statusCode, path, timestamp, requestId, error }`), client errors
  (4xx) with their message and details, server errors (5xx) generic outside local
  environments and reported to Sentry once.
- `TransformInterceptor` wraps every successful response as `{ success: true, data }`.
  Handlers return the payload only, never their own `success`/`data` wrapper.
- Boolean DTO fields use `@ToBoolean()`, which parses the raw input (the global
  `ValidationPipe` uses implicit conversion, which turns `"false"` into `true`).

## Consequences

- Tests check the real contract; pipeline changes are made once.
- Paginated payloads keep their own `data` array inside `data`
  (`{ success, data: { data: [...], total, ... } }`); that is a list shape, not a second
  envelope.

## Enforcement

- ESLint (controllers): a handler may not return an object with a `success` key.
- Unit tests for the filter and `@ToBoolean()`; integration specs assert the envelope.
