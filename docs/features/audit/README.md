# Audit Logging Feature

This document captures the current iteration of the audit logging stack, the API surface that consumers should rely on, and the outstanding follow-up work.

## Key Modules

| Module | Purpose |
| --- | --- |
| `AuditModule` | Bundles controllers, services, interceptors, and database providers. |
| `AuditContextFactory` | Builds `AuditContext` instances from Express requests or ad-hoc user metadata. |
| `AuditService` | Facade for creating audit logs with helpers such as `logLoginFromRequest`, `logLogoutFromRequest`, etc. |
| `AuditLogRepository` | Query/command abstraction over the `audit_logs` table with rich filtering helpers. |
| `AuditQueryService` | Read side for dashboards and reports (search, statistics, suspicious activity). |
| `AuditLogInterceptor` | Optional decorator-driven interceptor for automatic logging. |

## Usage Guidelines

1. **Prefer facade helpers** – in feature modules, call `auditService.log…FromRequest(req, user, metadata)` rather than composing contexts manually.  This guarantees consistent enrichment of user, request, and correlation metadata.
2. **Decorators for REST endpoints** – for CRUD-style endpoints that already use the `@AuditLog` decorator, ensure the interceptor is registered globally or at controller level.
3. **Domain events (future)** – longer term, migrate auth and other modules to emit events (`LoginSucceeded`, `PasswordReset`) that the audit module subscribes to.  The current direct service usage is a stopgap.
4. **Retention & archiving** – the repository exposes `search` and statistics primitives; background cleanup and archiving jobs still need to be scheduled.

## Outstanding Tasks

- Add integration tests that exercise `/api/audit/search`, `/statistics`, and `/critical-events` against seeded data.
- Wire additional modules (stories, attachments, etc.) to the new facade methods or interceptors.
- Build a background worker that leverages `AuditLogRepository` for retention enforcement (see `findCriticalEvents` / `findFailedOperations`).
- Expand documentation for the Postman collection and shell scripts (`test-audit-api.sh`, `test-audit-integration.sh`).

## Testing

- Unit: `npm run test -- audit-context.factory.spec.ts`
- Integration (stubbed repository): `npm run test -- audit.integration.spec.ts`

## Configuration

- `AUDIT_ENABLED` (`true` by default): toggles whether audit logs are persisted. When disabled, facade methods exit early.

## References

- `src/modules/audit/services/audit.service.ts`
- `src/modules/audit/services/audit-context.factory.ts`
- `src/modules/audit/database/audit-log.repository.ts`
- `src/modules/audit/controllers/audit.controller.ts`
