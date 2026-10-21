# src/shared audit

Date: 21 October 2026 (Asia/Amman). Baseline commit: `c91bb3169d412892c7d33bbbb4b1b897a203f53b`, plus the current working tree.

## Assessment

Reviewed all **28 files in `src/shared`**, their production call sites, application registration, and existing shared-layer unit tests. Findings cover security, correctness/code quality, performance, setup, and architecture.

**13 findings: 1 high, 7 medium, 5 low.** The most important active problems are the exception filter's server-error disclosure, URL logging that bypasses redaction, optional-boolean validation, and resilience behavior under concurrent failures. Several exported sanitization helpers are also unsafe to adopt as written, but have no production call sites in this repository. That distinction is explicit below; an unsafe unused helper is not evidence of a deployed endpoint exploit.

The shared layer has useful foundations: literal LIKE escaping, stable error codes, binary-response exclusions, raw-input boolean parsing, and a development-only guard that fails closed. The main architectural problem is retaining several competing implementations of sanitization and response processing with different guarantees.

No application code was changed. Other cache/configuration edits already present in the working tree were left alone. This report is separate from the broader module audit.

## Verification

| Check                              | Result                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared unit suites                 | **11 suites, 79 tests passed**, using Node 24.22.0; socket access allowed for the local HTTP test server                                                            |
| Full repository typecheck          | **Passed** with `npm run typecheck` under Node 24.22.0                                                                                                              |
| Targeted runtime probes            | Reproduced SH01–SH07 and SH09–SH12; SH08 additionally reproduced work completing after its timeout                                                                  |
| Call-site review                   | Confirmed the global filter and response interceptors are registered in `app.setup.ts`; identified active DTO/resilience/log-shipping consumers and dormant exports |
| Lint/build                         | Not run for this report-only task; the applied review skill excludes running linters                                                                                |
| Integration/load/browser execution | Not run. No production request, live email, external upload, or browser XSS execution was attempted                                                                 |

Passing tests do not cover the negative cases reproduced below. Source references use repository-relative paths and reviewed line numbers.

## File coverage

| Files                                                                      | Assessment                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decorators/sanitization.decorator.ts`                                     | Mutation order and regex-based sanitization need correction: SH04/SH06. SQL-character stripping is not a SQL security boundary                                                           |
| `decorators/to-boolean.decorator.ts`                                       | Correctly reads raw input to avoid `Boolean('false')`; invalid optional values disappear: SH03                                                                                           |
| `decorators/to-array.decorator.ts`                                         | Scalar/repeated/comma-separated parsing is straightforward; downstream validators must constrain element types and count                                                                 |
| `decorators/index.ts`, `dto/index.ts`, `errors/index.ts`, `pipes/index.ts` | Barrels reviewed; exports are inconsistent in breadth, with the decorator barrel exporting legacy sanitizers but not the newer conversion decorators                                     |
| `dto/example-secure.dto.ts`                                                | Demonstrates a sanitization composition that restores unsafe input: SH04; currently unused by controllers                                                                                |
| `dto/pagination-query.dto.ts`                                              | Bounded page size, zero-based page default; country usage is consistent. Do not reuse unchanged for one-based services                                                                   |
| `errors/error-code.ts`                                                     | Known-code allowlist and server-code normalization are useful; unknown 4xx statuses collapse to `BAD_REQUEST`, which is an explicit current contract                                     |
| `filters/http-exception.filter.ts`                                         | Global production consumer; server-body disclosure and raw-URL logging: SH01/SH02                                                                                                        |
| `guards/development-only.guard.ts`                                         | Allows only exact `NODE_ENV=development`; missing/test/staging/production values fail closed. Correctness still depends on deployment setting the intended environment                   |
| `interceptors/binary-response.ts`                                          | Correctly recognizes `StreamableFile` and `Buffer`; no material issue established for current callers                                                                                    |
| `interceptors/request-id.interceptor.ts`                                   | Correctly excludes binary responses and preserves existing IDs; generic object spreading is broader than plain JSON records, so avoid applying it to Dates/custom serializable instances |
| `interceptors/transform.interceptor.ts`                                    | Global response-envelope bypass uses a URL substring: SH12                                                                                                                               |
| `interceptors/compression.interceptor.ts`                                  | Dormant duplicate of the active Express compression middleware; negotiation/CPU/error handling defects: SH11                                                                             |
| `pipes/sanitization.pipe.ts`                                               | No production registrations found; HTML traversal/policy, size enforcement, and prototype handling need work: SH05/SH09/SH10                                                             |
| `types/express.d.ts`                                                       | Request/session/principal augmentations reviewed; several IDs remain optional because framework setup supplies them. No material standalone issue established                            |
| `utils/database-error.util.ts`                                             | Narrow PostgreSQL unique-violation detection via TypeORM; intentional database coupling despite its shared location                                                                      |
| `utils/email-validation.util.ts`                                           | Normalization and format helpers are simple; the ten-domain disposable-email list is incomplete by nature and is not used by registration                                                |
| `utils/environment.ts`                                                     | Local-environment allowlist is safer than assuming every non-production environment is local                                                                                             |
| `utils/error.util.ts`                                                      | Handles ordinary thrown values; generic `errorProperty<T>` is an unchecked assertion, not runtime type validation                                                                        |
| `utils/like.util.ts`                                                       | Correctly escapes backslash, `%`, and `_` for the documented PostgreSQL LIKE semantics; identifiers must still be allowlisted separately                                                 |
| `utils/phone-validation.util.ts`                                           | No production callers found; normalization/formatting are heuristic and differ from registration DTO validation. Count digits separately from `+` if enforcing a 15-digit limit          |
| `utils/post-file.util.ts`                                                  | Streams data instead of reading the whole archive; lacks caller cancellation/deadline: SH08                                                                                              |
| `utils/request.util.ts`                                                    | Uses Express-derived client IP. `TRUST_PROXY=true` deliberately accepts all proxies; retain deployment guidance. User-agent parsing is heuristic and should not authorize access         |
| `utils/resilience.ts`                                                      | Active cache/S3/SMTP callers; recovery admission and deadline semantics need work: SH07/SH08                                                                                             |
| `utils/slug.util.ts`                                                       | Useful Arabic/Persian transliteration; sequential collision probes and exhaustion: SH13                                                                                                  |

## Findings

### SH01 — High: any structured 5xx body with `details` bypasses production masking

Evidence: `src/shared/filters/http-exception.filter.ts:142`–`144`. **Active global filter.**

The filter first chooses a generic server-error message, but subsequently merges the entire exception response whenever it has a `details` property. That property is treated as proof that the response is a safe health-check payload. The merge can overwrite the safe message and add private fields or a stack. Only the machine-readable `code` is reset afterward.

Local reproduction with error details disabled:

```ts
new ServiceUnavailableException({
  message: 'internal db password=SENSITIVE',
  details: { host: '10.0.0.5' },
  privateContext: 'SENSITIVE'
})
```

The emitted JSON included all three fields, including the original internal message. This proves a disclosure path in the common error boundary, not that a current public route exposes that particular synthetic secret.

Fix: never merge an arbitrary server-error body. Allowlist public health fields and validate their shape, or identify explicitly approved public error types. Preserve the generic message regardless of additional fields. Add tests for a 500/503 with both `details` and confidential sibling properties.

### SH02 — Medium: raw URLs bypass query redaction in error logs

Evidence: `src/shared/filters/http-exception.filter.ts:108`, `:116`. **Active global filter.**

The query object is sanitized, but the same input is logged unredacted in `url` and interpolated into the log message. A request to `/api/x?token=SECRET` produces a redacted `query.token` alongside a raw URL containing `SECRET`. This happens for client errors as well as server errors. Query-string email addresses also remain visible.

Fix: log the pathname and a separately redacted query representation, or sanitize the URL before every logging/reporting destination. Cover both structured log fields and message text; Pino's object-path redaction does not redact substrings embedded in arbitrary strings.

### SH03 — Medium: invalid optional booleans pass validation

Evidence: `src/shared/decorators/to-boolean.decorator.ts:7`–`15`, `:27`. **Active across feature DTOs.**

`parseBooleanInput()` maps both missing and invalid input to `undefined`. With `@IsOptional()`, that skips `@IsBoolean()` entirely. The existing test rejects invalid input only for a required field, leaving the optional case uncovered.

Probe: a property with `@IsOptional() @ToBoolean() @IsBoolean()` accepts `{ flag: 'maybe' }` with zero errors. Real callers include optional attachment visibility, role/status flags, and content filters. In `InitiateUploadDto`, an invalid optional `isPublic` value disappears and downstream visibility resolution can select its public default. Required `UploadAttachmentDto.isPublic` does reject invalid values, so the behavior is inconsistent between upload paths.

Fix: preserve an invalid sentinel/original value so boolean validation fails, while treating absent input separately. Define a deliberate policy for `null` and empty strings. Test JSON/query/multipart values on optional, required, and defaulted properties. [class-validator documents that `IsOptional` skips other validators for null/undefined](https://github.com/typestack/class-validator).

### SH04 — Medium: sanitization validators overwrite each other's results

Evidence: `src/shared/decorators/sanitization.decorator.ts:69`–`74`, `:134`–`139`; `src/shared/dto/example-secure.dto.ts:22`. **Exported helpers; only the unused example DTO combines them in this repository.**

The decorators mutate DTO properties from inside class-validator constraints. Validators for the same property receive the original value, so a later `Trim` can restore HTML that `SanitizeHtml` removed. This also makes validation run against a different value from the final stored value.

Probe: an otherwise valid `ExampleSecureDto` with `bio` and `title` set to `<img src=x onerror=alert(1)>` returned **zero validation errors** and retained `<img src=x onerror=alert(1)>` in both properties. Its `stripTags` setting did not survive composition. A spaced email was rejected even though the mutated DTO afterward contained a trimmed email.

Fix: run transformations in an explicit, deterministic pre-validation stage and validate the result. Keep validation predicates free of mutation. Add composition tests based on the published example, not only tests using a single sanitization decorator. Do not copy this example into an endpoint until corrected.

### SH05 — Medium: HTML pipe skips string-array elements and ignores its attribute policy

Evidence: `src/shared/pipes/sanitization.pipe.ts:97`–`120`. **Dormant export; no controller/global registration found.**

`sanitizeObject()` handles arrays by recursively calling itself on each element, but its string base case returns the original string. A direct string is sanitized; `['<script>alert(1)</script>']` is returned unchanged. Nested string arrays have the same problem.

The pipe also supplies a per-tag object to DOMPurify's `ALLOWED_ATTR`, which expects an array. A probe retained `style="position:fixed;inset:0"` and `class="overlay"` on a paragraph despite the pipe's intended narrow attribute policy. DOMPurify still applies its own security defaults; retaining style/class alone is not proof of arbitrary script execution.

Fix: use one recursive sanitizer whose string base case always sanitizes; pass a typed DOMPurify configuration with a real attribute array, and use a hook if per-tag restrictions are required. Share the policy with the decorator rather than maintaining two divergent versions. [DOMPurify's configuration type defines the attribute allowlist](https://github.com/cure53/DOMPurify/blob/main/src/config.ts).

### SH06 — Medium: `RemoveScripts` is bypassable and gives false assurance

Evidence: `src/shared/decorators/sanitization.decorator.ts:339`–`359`. **Dormant exported decorator.**

The regex only strips event handlers with quoted values. `<img src=x onerror=alert(1)>` survives unchanged. Regex matching is also not an HTML parser or URL-scheme validator. Unlike `SanitizeHtml`, this helper does not use the installed DOMPurify implementation.

Fix: remove/deprecate this helper or route it through the same reviewed HTML sanitizer. Add malformed/unquoted markup regression cases. No production usage was found, so this is a reusable-library defect rather than a demonstrated active endpoint XSS. [DOMPurify provides the existing parser-based implementation](https://github.com/cure53/DOMPurify).

### SH07 — Medium: half-open circuit recovery admits a request surge and stale results

Evidence: `src/shared/utils/resilience.ts:34`–`60`. **Active in cache/S3/SMTP services.**

Once cooldown expires, the breaker changes to `HALF_OPEN` but does not limit in-flight probes. Every concurrent caller enters the recovering dependency. A probe admitted ten simultaneous calls while the first recovery probe was still pending.

Results also lack a circuit generation. A slow request started before the circuit opened can complete while a new recovery probe is pending; `onSuccess()` counts that old result toward recovery. A probe showed the state becoming `CLOSED` from that old success before the recovery probe completed.

Fix: bound half-open admission, associate executions with a generation, and let only current recovery results change the recovery state. Validate thresholds/reset durations and test controlled interleavings: trip, cooldown, pending probe, old success/failure, concurrent callers.

### SH08 — Medium: deadlines do not consistently bound outbound work

Evidence: `src/shared/utils/resilience.ts:82`–`98`, `src/shared/utils/post-file.util.ts:12`–`24`; consumers in `src/infrastructure/email/services/email.service.ts:134` and `src/core/logging/log-maintenance.service.ts:150`. **Active when those integrations are enabled.**

`withTimeout()` limits how long its caller waits and sends an abort signal. It cannot stop work that ignores that signal. The SMTP caller invokes `mailer.sendMail()` without forwarding cancellation; a timeout can fail/retry a job while the original send later completes. A local non-cancellable promise completed after the timeout had already rejected. Some S3 body consumption also occurs after the timeout-wrapped command returns, so the command deadline is not necessarily a full-transfer deadline.

Separately, `postFile()` accepts no abort signal or explicit deadline. Slow log shipping can keep rotation pending and allow scheduled runs to overlap. It should expose cancellation even if the underlying HTTP implementation has its own transport-level timeouts.

Fix: document caller-wait versus operation-cancellation guarantees, pass signals where supported, apply transport-specific SMTP limits, and account for potentially ambiguous sends before retrying. Carry a deadline through file upload and response-body consumption; clean up streams on abort. Guard the optional timeout notification callback so it cannot prevent timeout rejection by throwing.

### SH09 — Low: payload-size pipe acts after parsing and throws on an absent body

Evidence: `src/shared/pipes/sanitization.pipe.ts:138`–`153`. **Dormant export.**

The pipe computes `JSON.stringify(value)` and allocates another serialized copy after the transport has already accepted/parsed the body. That does not protect the initial read/parse allocation, nor measure multipart file bytes. `transform(undefined, { type: 'body' })` throws a TypeError because serialization returns undefined; oversized bodies receive 400 instead of the expected 413 classification.

Fix: enforce transport/body-parser limits before buffering and use this only as an explicitly documented semantic budget. Handle empty bodies, avoid serializing arbitrary rich objects, and throw `PayloadTooLargeException` for size rejection. Do not wire it globally as a substitute for transport limits.

### SH10 — Low: recursive sanitizers copy `__proto__` into ordinary objects

Evidence: `src/shared/pipes/sanitization.pipe.ts:27`–`29`, `:115`–`120`. **Dormant exports.**

Both object-copy paths assign untrusted keys onto `{}`. A JSON input containing `{"__proto__":{"role":"admin"}}` changes the prototype of the returned object; reading `result.role` then returns `admin` although it is not an own property. This does **not** pollute global `Object.prototype`, and no current production registration or authorization exploit was found.

Fix: create null-prototype dictionaries or define own properties safely, and explicitly reject dangerous keys if the receiving contract disallows them. Test inherited versus own-property access and put depth/shape limits on recursive input handling.

### SH11 — Low: unused compression interceptor is an unsafe alternative to the active middleware

Evidence: `src/shared/interceptors/compression.interceptor.ts:45`, `:66`, `:84`, `:90`. **No production registration found; `app.setup.ts` uses Express compression.**

The interceptor compresses even for `Accept-Encoding: gzip;q=0` (reproduced), performs synchronous gzip on the event loop, overwrites `Vary`, and serializes before checking content type. Undefined responses can throw outside its catch block; Buffers are JSON-serialized rather than preserved as binary.

Fix: remove this unused alternative and keep the existing middleware. If it must remain, correctly negotiate encodings, preserve binary/empty bodies, append `Vary`, and use asynchronous compression with tests. Do not add it alongside the current middleware.

### SH12 — Low: response envelopes can be disabled through a query string

Evidence: `src/shared/interceptors/transform.interceptor.ts:17`. **Active global interceptor.**

The metrics exemption uses `request.url.includes('/metrics')`. `/api/v1/users?x=/metrics` therefore bypasses the JSON envelope, even though the matched endpoint is not the metrics endpoint. Reproduced with the interceptor directly. This alters the API contract; it does not bypass authentication or record authorization.

Fix: compare the exact normalized pathname or use explicit route metadata for raw responses. Test query strings, similarly named paths, and the actual `/metrics` route.

### SH13 — Low: slug collision allocation performs up to 999 serial probes

Evidence: `src/shared/utils/slug.util.ts:109`–`122`. **Active in categories, post types, and content creation.**

For a common title, each collision causes another awaited existence query. Once the base and suffixes through `-999` are occupied, creation throws a generic Error. The helper also cannot reserve the returned slug; callers correctly use unique constraints but may still return a collision error under concurrency.

Fix: retain database uniqueness, use a bounded short search followed by a collision-resistant suffix/retry, and translate exhaustion to an explicit domain error if it remains a supported limit. Validate length options and normalize custom fallbacks if this function is exposed beyond its current controlled callers. No load benchmark was run.

## Architecture, setup, and code-quality recommendations

1. **Make shared guarantees explicit.** Separate normalization, validation, HTML sanitization, output encoding, and transport limits. A function named `SanitizeSql` that removes apostrophes/semicolons corrupts legitimate values and does not establish SQL-injection safety; parameterized queries remain the required boundary. Remove unused safety claims and unsafe examples.
2. **Consolidate policy.** One typed HTML sanitizer should power approved call sites. Keep protocol checks explicit. Avoid applying recursive string cleanup to whole request bodies containing passwords, signatures, opaque IDs, or free-form JSON; those values may depend on exact bytes.
3. **Keep transport-specific components visible.** Filters/interceptors/Express declarations are HTTP adapters; DOMPurify and PostgreSQL helpers are concrete integrations. `shared` is not framework-free as the README suggests. Either document it as common application infrastructure or move those components to clearer HTTP/security/database locations when changing them for a concrete reason. No broad folder rewrite is needed to fix these findings.
4. **Treat utility contracts as runtime contracts.** `errorProperty<T>` does not validate `T`; the filter's `error.message: string` type is inaccurate for validation message arrays. Define the actual error-body union and narrow unknown data before merging it.
5. **Document pagination and environment assumptions.** The shared pagination DTO starts at zero; the audit service's one-based pagination is currently supplied by a different DTO and is not a current off-by-one bug. Keep proxy trust deployment-specific and never use user-agent strings as a security signal.
6. **Keep optional helpers honest.** The email/phone utilities do not enforce registration policy simply by existing. The sanitization and size pipes are not globally installed. Do not advertise them as active protections without registration and behavior tests.

## Fix order and regression checks

| Order | Work           | Acceptance checks                                                                                                                                                                                      |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | SH01/SH02      | Production-mode 5xx responses never expose confidential sibling fields; token-bearing URLs are absent from structured logs and message text                                                            |
| 2     | SH03/SH07/SH08 | Invalid optional booleans return validation errors; recovery admits a bounded probe count; stale completions cannot close the breaker; outbound deadlines/cancellation and ambiguous sends are covered |
| 3     | SH04–SH06      | The example DTO sanitizes before validating; arrays of strings use the same HTML policy; unquoted handlers are removed; only the documented attributes survive                                         |
| 4     | SH09–SH13      | Remove unused broken alternatives or correct their contracts; test absent bodies/prototype keys, exact metrics exemption, and slug saturation/concurrency                                              |

Add focused regression coverage at these boundaries. The existing 79 tests are fast and useful, but there are no dedicated shared suites for resilience or sanitization pipes, and the current sanitization test checks one decorator at a time rather than composition. Re-run the full validation pipeline on the final implementation and use a disposable integration environment for SMTP/HTTP cancellation and concurrent dependency failures.
