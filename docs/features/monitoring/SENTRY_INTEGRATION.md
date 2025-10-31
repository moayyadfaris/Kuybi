# Sentry Error Tracking & Monitoring Integration

## Overview

Enterprise-grade error tracking and performance monitoring integration using Sentry. Provides real-time error tracking, security event monitoring, and application performance insights across all application processes (API, workers, dashboard).

**Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Sentry SDK**: @sentry/node v10.22.0  
**Branch**: `feature/sentry-integration`

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Usage](#usage)
- [Integration Points](#integration-points)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Features

### Core Capabilities
- ✅ **Error Tracking**: Automatic capture of unhandled exceptions and errors
- ✅ **Performance Monitoring**: Request tracing and performance profiling
- ✅ **User Context**: Automatic user identification in error reports
- ✅ **Security Monitoring**: Failed login attempts, unauthorized access, suspicious activity
- ✅ **Audit Integration**: Critical audit failures captured to Sentry
- ✅ **Environment-Aware**: Auto-enabled in production, disabled in development
- ✅ **Sensitive Data Filtering**: Automatic removal of passwords, tokens, secrets
- ✅ **Sample Rates**: Configurable sampling for traces and profiles
- ✅ **Global Coverage**: Works across API, workers, and dashboard processes

### Smart Filtering
- **Server Errors Only**: Captures 500+ HTTP errors, ignores 4xx client errors
- **Sensitive Data Scrubbing**: Removes authorization headers, cookies, passwords
- **Breadcrumb Tracking**: HTTP requests, responses, and custom events
- **Request Context**: Full request details (method, URL, headers, query params)

## Architecture

### Module Structure

```
src/core/sentry/
├── index.ts                      # Barrel exports
├── sentry.module.ts              # Global Sentry module
├── sentry.service.ts             # Core Sentry service
├── sentry.interceptor.ts         # Request/error interceptor
├── sentry.filter.ts              # Exception filter (500+ errors)
└── sentry-test.controller.ts    # Test endpoints (dev only)
```

### Integration Flow

```
Request → SentryInterceptor (set user context, add breadcrumbs)
  ↓
Controller/Service Execution
  ↓
Error Occurs?
  ↓
SentryFilter (capture 500+ errors) → Sentry Dashboard
  ↓
SentryInterceptor (capture exception, add context) → Sentry Dashboard
```

### Global Configuration

The `SentryModule` is marked as `@Global()` and registered in `AppModule`:

```typescript
// src/app.module.ts
@Module({
  imports: [
    // ... other modules
    SentryModule.forRoot(), // Global error tracking
    // ... other modules
  ]
})
export class AppModule {}
```

**Important**: Modules that use `SentryService` must explicitly import `SentryModule.forRoot()`:
- `AuditModule` - For audit failure tracking
- `AuthModule` - For authentication error tracking

## Configuration

### Environment Variables

Add to `.env` file:

```bash
# Sentry Error Tracking & Monitoring
# Enable/disable Sentry (auto-enabled in production)
SENTRY_ENABLED=false

# Sentry DSN (Data Source Name) from your Sentry project
# Get this from: https://sentry.io/settings/[org]/projects/[project]/keys/
SENTRY_DSN=

# Environment name (development, staging, production)
SENTRY_ENVIRONMENT=development

# Application version/release (for tracking deployments)
SENTRY_RELEASE=kuybi-nest@0.1.0

# Performance monitoring sample rate (0-100)
# Percentage of transactions to send for performance monitoring
# Production: 10% = 10, Development: 0% = 0
SENTRY_TRACES_SAMPLE_RATE=10

# Profiling sample rate (0-100)
# Percentage of transactions to profile (CPU/memory usage)
# Production: 10% = 10, Development: 0% = 0
SENTRY_PROFILES_SAMPLE_RATE=10

# Enable debug mode (verbose logging)
SENTRY_DEBUG=false
```

### Configuration Defaults

The system uses smart environment-aware defaults:

| Setting | Development | Production |
|---------|-------------|------------|
| `enabled` | `false` | `true` (auto) |
| `tracesSampleRate` | `0%` | `10%` |
| `profilesSampleRate` | `0%` | `10%` |
| `debug` | `false` | `false` |

### TypeScript Configuration

Configuration is defined in `src/config/configuration.ts`:

```typescript
sentry: {
  enabled: parseBoolean(process.env.SENTRY_ENABLED, env === 'production'),
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || env,
  release: process.env.SENTRY_RELEASE || 'kuybi-nest@0.1.0',
  tracesSampleRate: parseNumber(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    env === 'production' ? 10 : 0
  ) / 100,
  profilesSampleRate: parseNumber(
    process.env.SENTRY_PROFILES_SAMPLE_RATE,
    env === 'production' ? 10 : 0
  ) / 100,
  debug: parseBoolean(process.env.SENTRY_DEBUG, false)
}
```

## Usage

### SentryService API

The `SentryService` provides a comprehensive API for error tracking:

#### Capture Exceptions

```typescript
import { SentryService } from '@core/sentry'

constructor(private readonly sentryService: SentryService) {}

// Capture an error with context
try {
  await riskyOperation()
} catch (error) {
  this.sentryService.captureException(error, {
    operation: 'data_processing',
    userId: user.id,
    recordId: record.id
  })
  throw error
}
```

#### Capture Messages

```typescript
// Info level message
this.sentryService.captureMessage('Payment processed successfully', 'info', {
  paymentId: payment.id,
  amount: payment.amount
})

// Warning level message
this.sentryService.captureMessage('Rate limit approaching', 'warning', {
  userId: user.id,
  currentRate: 95
})

// Error level message
this.sentryService.captureMessage('Data sync failed', 'error', {
  syncId: sync.id,
  errorCode: 'SYNC_TIMEOUT'
})
```

#### Set User Context

```typescript
// Set user for error tracking
this.sentryService.setUser({
  id: user.id,
  email: user.email,
  username: user.username
})

// Clear user context (e.g., on logout)
this.sentryService.clearUser()
```

#### Add Breadcrumbs

```typescript
// Add breadcrumb for debugging context
this.sentryService.addBreadcrumb(
  'Database query executed',
  'database',
  {
    query: 'SELECT * FROM users',
    duration: 125,
    rows: 50
  }
)
```

#### Set Custom Context

```typescript
// Add custom context for errors
this.sentryService.setContext('payment', {
  processor: 'stripe',
  method: 'credit_card',
  amount: 99.99,
  currency: 'USD'
})

// Add tags for filtering
this.sentryService.setTag('feature', 'checkout')
this.sentryService.setTag('version', '2.0')
```

#### Check Status

```typescript
// Check if Sentry is enabled
if (this.sentryService.isEnabled()) {
  // Sentry is active
}
```

## Integration Points

### Audit Service Integration

The `AuditService` automatically captures critical failures to Sentry:

```typescript
// Audit log creation failures
try {
  await this.auditLogRepository.save(auditLog)
} catch (error) {
  this.sentryService.captureException(error, {
    action: options.action,
    entityType: options.entityType,
    userId: context.userId,
    errorContext: 'audit_log_creation_failed'
  })
  throw error
}

// Unauthorized access attempts
this.sentryService.captureMessage(
  `Unauthorized access attempt to ${resource}`,
  'warning',
  {
    userId: context.userId,
    resource,
    reason,
    ipAddress: context.ipAddress
  }
)

// Suspicious activity
this.sentryService.captureMessage(
  `Suspicious activity detected: ${activityType}`,
  'error',
  {
    userId: context.userId,
    activityType,
    ipAddress: context.ipAddress,
    ...details
  }
)
```

### Auth Service Integration

The `AuthService` tracks authentication failures:

```typescript
// Failed login - user not found
this.sentryService.captureMessage(
  `Failed login attempt for email: ${email}`,
  'warning',
  {
    email,
    reason: 'user_not_found'
  }
)

// Invalid password
this.sentryService.captureMessage(
  `Invalid password attempt for user: ${user.id}`,
  'warning',
  {
    userId: user.id,
    email: user.email,
    reason: 'invalid_password'
  }
)

// Inactive user
this.sentryService.captureMessage(
  `Inactive user login attempt: ${user.id}`,
  'warning',
  {
    userId: user.id,
    email: user.email,
    reason: 'user_inactive'
  }
)
```

### Automatic HTTP Error Tracking

The `SentryInterceptor` and `SentryFilter` automatically track errors:

```typescript
// Interceptor: Captures ALL errors, adds request context
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    // Set user context
    // Add request breadcrumb
    return next.handle().pipe(
      catchError((error) => {
        // Capture exception with full context
        this.sentryService.captureException(error, {
          route: request.route?.path,
          controller: context.getClass().name,
          handler: context.getHandler().name
        })
        return throwError(() => error)
      })
    )
  }
}

// Filter: Only captures 500+ errors (server errors)
@Catch()
export class SentryFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException 
      ? exception.getStatus() 
      : HttpStatus.INTERNAL_SERVER_ERROR

    // Only capture 500+ errors to Sentry
    if (status >= 500) {
      this.sentryService.captureException(exception)
    }

    // Return error response
  }
}
```

## Testing

### Test Endpoints (Development Only)

When `SENTRY_ENABLED=false`, test endpoints are available:

```bash
# Check Sentry status
curl http://localhost:4040/api/sentry-test/status

# Test generic error capture
curl -X POST http://localhost:4040/api/sentry-test/test-error

# Test 4xx error (should NOT go to Sentry)
curl -X POST http://localhost:4040/api/sentry-test/test-http-error

# Test 5xx error (should go to Sentry)
curl -X POST http://localhost:4040/api/sentry-test/test-server-error

# Test message capture
curl -X POST http://localhost:4040/api/sentry-test/test-message
```

### Manual Testing

1. **Enable Sentry** in `.env`:
   ```bash
   SENTRY_ENABLED=true
   SENTRY_DSN=your-sentry-dsn-here
   ```

2. **Restart application**:
   ```bash
   npm run build
   pm2 restart all
   ```

3. **Trigger test error**:
   ```bash
   curl -X POST http://localhost:4040/api/sentry-test/test-error
   ```

4. **Check Sentry Dashboard**:
   - Go to https://sentry.io/organizations/[org]/issues/
   - Verify error appears with full context

### Verification Checklist

- [ ] Sentry initializes correctly (check logs)
- [ ] Test endpoints respond correctly
- [ ] Errors appear in Sentry dashboard
- [ ] User context is set correctly
- [ ] Breadcrumbs are captured
- [ ] Sensitive data is filtered
- [ ] 4xx errors are NOT sent to Sentry
- [ ] 5xx errors ARE sent to Sentry
- [ ] Worker process works without errors
- [ ] Performance traces appear (if enabled)

## Production Deployment

### Step 1: Create Sentry Project

1. Go to https://sentry.io
2. Create new project (Node.js)
3. Copy the DSN (Data Source Name)

### Step 2: Configure Environment

Update `.env` or environment variables:

```bash
# Production environment
SENTRY_ENABLED=true
SENTRY_DSN=https://[key]@[org].ingest.sentry.io/[project]
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=kuybi-nest@1.0.0
SENTRY_TRACES_SAMPLE_RATE=10
SENTRY_PROFILES_SAMPLE_RATE=10
SENTRY_DEBUG=false
```

### Step 3: Build & Deploy

```bash
# Build application
npm run build

# Restart all PM2 processes
pm2 restart all

# Verify Sentry is enabled
pm2 logs kuybi-api --nostream | grep "Sentry"
pm2 logs kuybi-worker --nostream | grep "Sentry"
```

### Step 4: Verify Integration

1. Check logs for Sentry initialization
2. Trigger a test error (if safe)
3. Verify error appears in Sentry dashboard
4. Check performance traces in Sentry

### Recommended Production Settings

```bash
# Conservative sampling for large-scale apps
SENTRY_TRACES_SAMPLE_RATE=5    # 5% of requests
SENTRY_PROFILES_SAMPLE_RATE=5  # 5% of requests

# Aggressive sampling for critical apps
SENTRY_TRACES_SAMPLE_RATE=100  # 100% of requests
SENTRY_PROFILES_SAMPLE_RATE=50 # 50% of requests
```

### Release Tracking

Update `SENTRY_RELEASE` on each deployment:

```bash
# Use git commit hash
SENTRY_RELEASE=kuybi-nest@$(git rev-parse --short HEAD)

# Use version + timestamp
SENTRY_RELEASE=kuybi-nest@1.2.0-20251031
```

## Troubleshooting

### Issue: "Sentry is disabled via configuration"

**Cause**: Sentry is not enabled in environment variables.

**Solution**:
```bash
# Enable in .env
SENTRY_ENABLED=true
SENTRY_DSN=your-dsn-here

# Restart
pm2 restart all
```

### Issue: "Cannot resolve dependencies of SentryService"

**Cause**: Module doesn't import `SentryModule`.

**Solution**:
```typescript
// Add to module imports
@Module({
  imports: [
    SentryModule.forRoot(),
    // ... other imports
  ]
})
```

### Issue: Errors not appearing in Sentry

**Checklist**:
- [ ] Verify `SENTRY_ENABLED=true`
- [ ] Verify `SENTRY_DSN` is correct
- [ ] Check error status code (4xx errors are not sent)
- [ ] Check sample rates (increase to 100% for testing)
- [ ] Check Sentry project quotas
- [ ] Verify network connectivity to Sentry

### Issue: Too many events in Sentry

**Solution**: Reduce sample rates:
```bash
# Reduce to 1% of requests
SENTRY_TRACES_SAMPLE_RATE=1
SENTRY_PROFILES_SAMPLE_RATE=1
```

### Issue: Sensitive data in error reports

**Solution**: The system automatically filters:
- Authorization headers
- Cookies
- Passwords, tokens, secrets from request body

If additional filtering is needed, update `beforeSend` in `sentry.service.ts`.

## Performance Impact

### Overhead

- **Enabled with 10% sampling**: ~0.5-1% performance overhead
- **Enabled with 100% sampling**: ~2-3% performance overhead
- **Disabled**: 0% overhead

### Memory Usage

- **Per instance**: ~10-20 MB additional memory
- **Breadcrumbs**: Stored in memory (max 100 per request)

### Network

- **Per error**: ~5-10 KB
- **Per trace**: ~2-5 KB
- **Async**: Non-blocking, batched uploads

## Best Practices

### Do's ✅

- Enable in production environments
- Use conservative sample rates (5-10%)
- Add meaningful context to errors
- Use breadcrumbs for debugging flow
- Set user context for better tracking
- Monitor Sentry quota usage
- Update releases on deployment

### Don'ts ❌

- Don't send 4xx client errors to Sentry
- Don't include sensitive data in contexts
- Don't use 100% sampling in high-traffic production
- Don't rely solely on Sentry (use application logs too)
- Don't forget to disable test endpoints in production

## Related Documentation

- [Audit Logging](../audit/AUDIT_LOGGING.md)
- [Authentication](../auth/README.md)
- [Logging System](../logging/README.md)
- [Cache Configuration](../../architecture/CACHE_CONFIGURATION.md)

## Support

For issues or questions:
- Check [Sentry Documentation](https://docs.sentry.io/platforms/node/)
- Review application logs
- Check PM2 process status: `pm2 status`
- View Sentry dashboard: https://sentry.io

---

**Last Updated**: October 31, 2025  
**Maintained By**: Kuybi Development Team
