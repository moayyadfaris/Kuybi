# Enterprise Logging Upgrade

This document explains the new, production-grade logging pipeline shipped on 2025-10-25.

## Highlights

1. **Centralized configuration**
   - `src/config/configuration.ts` now exposes a `logging` section with level, console output, directories, rotation, retention, safe payload fields, and remote shipping toggles.
   - All options have environment-variable overrides (`LOG_LEVEL`, `LOG_DIR`, `LOG_ROTATE_MAX_BYTES`, etc.) that can be managed per environment without touching code.

2. **Request-scoped logging**
   - `LoggingContextInterceptor` captures `req.log` (or falls back to the root logger), enriches it with `requestId`, `userId`, and service metadata, and publishes it through `LoggingContextService`.
   - Controllers can access the contextual logger via the `@ReqLogger()` decorator, while services can inject `LoggingContextService` and call `getLogger(...)`.
   - `StoriesService#create` demonstrates the new pattern and no longer emits `console.*`.

3. **Safer error logging**
   - `HttpExceptionFilter` now receives `ConfigService` and logs only whitelisted request payload fields (`LOG_SAFE_FIELDS`) with truncation (`LOG_PAYLOAD_FIELD_LIMIT`).
   - Sensitive keys (password, token, secret, authorization, apiKey, credential) are forced to `[REDACTED]`.
   - Logged metadata still includes correlation IDs, user ID, method, and path; stack traces remain development-only in responses but are recorded in the log files for troubleshooting.

4. **Automated rotation, retention, and shipping**
   - `LogMaintenanceService` (bootstrapped via `LoggingModule`) watches `server.log` and `error.log`, rotating them once they cross `LOG_ROTATE_MAX_BYTES` or at midnight.
   - Archived logs live under `logs/archive/` and are automatically deleted after `LOG_RETENTION_DAYS`.
   - Optional remote shipping: set `LOG_SHIPPER_ENABLED=true`, `LOG_SHIPPER_ENDPOINT=https://...`, and optionally `LOG_SHIPPER_API_KEY`. Each rotated archive is POSTed (streamed) to that endpoint.
   - Manual scripts (`npm run logs:rotate`, `npm run logs:cleanup`) remain available but are no longer required.

## How to use the new stack

### Configure per environment

```bash
# .env (example)
LOG_LEVEL=info
LOG_ENABLE_CONSOLE=false
LOG_ROTATE_MAX_BYTES=20971520   # 20 MB
LOG_RETENTION_DAYS=14
LOG_SHIPPER_ENABLED=true
LOG_SHIPPER_ENDPOINT=https://logs.example.com/ingest
LOG_SHIPPER_API_KEY=super-secret
```

### Access the contextual logger in code

```ts
import { LoggingContextService } from '../logging/logging-context.service'

constructor(private readonly loggingContext: LoggingContextService) {}

async handleSomething() {
  const logger = this.loggingContext.getLogger({ context: 'BillingService', action: 'charge' })
  logger.info({ invoiceId }, 'Submitting charge request')
}
```

or inside controllers:

```ts
import { ReqLogger } from '../logging/decorators/request-logger.decorator'

@Post()
create(@Body() dto: CreateDto, @ReqLogger() logger: pino.Logger) {
  logger.debug({ dtoId: dto.id }, 'Controller received payload')
  return this.service.create(dto)
}
```

### Remote shipping contract

When the shipper is enabled, every rotated archive triggers a `POST` request with:

- `Content-Type: application/octet-stream`
- `X-Log-Filename: server_2025-10-25T21-00-00.log`
- Optional `Authorization: Bearer <LOG_SHIPPER_API_KEY>`
- **Body**: raw log file stream (no compression applied by default)

Ensure your receiving endpoint can handle multi-megabyte payloads and responds with `2xx`. Any non-success status is logged as an error and does not delete the local archive.

## Operational checklist

- **Disk sizing**: ensure `LOG_DIR` resides on a partition with enough disk to hold at least `(maxBytes * rotation interval)` plus archive retention.
- **Monitoring**: tail `logs/error.log` or ingest via your SIEM. Rotation events include both source and archive paths for observability.
- **Backups**: if legal/compliance requires longer retention, point `LOG_SHIPPER_ENDPOINT` to a storage service (S3 proxy, Loki gateway, etc.) and keep `LOG_RETENTION_DAYS` small locally.

## Next steps

- Wire the remote shipper endpoint to your centralized log lake (Elastic, Loki, CloudWatch, etc.).
- Gradually migrate remaining services from `PinoLogger` to `LoggingContextService` to capture request-scoped metadata everywhere.
- Extend the `ReqLogger` decorator to GraphQL/Microservice contexts if needed.
