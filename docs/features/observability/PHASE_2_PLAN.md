# OpenTelemetry Phase 2 - Redis & Custom Spans

## Overview

**Phase:** Redis Instrumentation & Custom Business Spans  
**Status:** 🏃 IN PROGRESS  
**Start Date:** November 5, 2025  
**Estimated Duration:** 2-3 days  
**Dependencies:** Phase 1 complete ✅

## Objectives

### 1. Redis Instrumentation 🎯
Add custom OpenTelemetry spans to all Redis operations for complete cache observability.

**Target:** `src/core/cache/redis.service.ts`

**Methods to Instrument:**
- `get(key)` - Cache retrieval
- `set(key, value, ttl?)` - Cache storage
- `del(key)` - Cache deletion
- `mget(keys)` - Multi-get operations
- `mset(items, ttl?)` - Multi-set operations
- `exists(key)` - Key existence check
- `ttl(key)` - Get TTL
- `keys(pattern)` - Pattern matching
- `flushdb()` - Database flush
- `ping()` - Connection check

**Span Attributes to Capture:**
- `cache.operation` - Operation type (get, set, del, etc.)
- `cache.key` - Cache key (sanitized)
- `cache.hit` - Boolean (for get operations)
- `cache.ttl` - TTL value (for set operations)
- `cache.size` - Value size in bytes
- `cache.keys.count` - Number of keys (for multi operations)
- `cache.pattern` - Pattern (for keys operation)

### 2. HTTP Request Tracing 🎯
Create NestJS interceptor to wrap all HTTP requests in custom spans.

**Implementation:** `src/core/observability/interceptors/tracing.interceptor.ts`

**Span Attributes:**
- `http.method` - Request method (GET, POST, etc.)
- `http.route` - Route pattern (/api/stories/:id)
- `http.url` - Full URL
- `http.status_code` - Response status
- `http.user_agent` - User agent
- `user.id` - Authenticated user ID
- `user.email` - User email
- `request.id` - Request correlation ID
- `request.duration` - Total duration

**Integration Points:**
- Register globally in `AppModule`
- Add to existing request pipeline
- Correlate with PostgreSQL spans
- Link to audit logs

### 3. Business Operation Tracing 🎯
Add custom spans to critical business workflows.

#### 3.1 Authentication Flow
**File:** `src/modules/auth/services/auth.service.ts`

**Methods:**
- `login(email, password)` - Complete login flow
  - Span: "auth.login"
  - Child spans: "auth.validate_credentials", "auth.create_session", "auth.generate_tokens"
  
- `refreshToken(refreshToken)` - Token refresh
  - Span: "auth.refresh_token"
  - Child spans: "auth.validate_refresh_token", "auth.rotate_session"

- `logout(userId, sessionId)` - Logout flow
  - Span: "auth.logout"
  - Child spans: "auth.blacklist_token", "auth.cleanup_session"

#### 3.2 Story Creation
**File:** `src/modules/stories/services/stories.service.ts`

**Methods:**
- `create(createStoryDto)` - Story creation
  - Span: "story.create"
  - Child spans: "story.validate", "story.save", "story.link_categories", "story.link_tags"
  - Attributes: story.type, story.status, categories.count, tags.count

#### 3.3 File Upload
**File:** `src/modules/attachments/services/attachments.service.ts`

**Methods:**
- `uploadFile(file, metadata)` - Upload workflow
  - Span: "attachment.upload"
  - Child spans: "attachment.validate", "s3.upload", "attachment.process_metadata", "attachment.save"
  - Attributes: file.size, file.mimetype, s3.bucket, s3.key

### 4. Metrics Integration 🎯
Link metrics collection with active trace context.

**Enhancements to MetricsService:**
- Add trace context to metric labels
- Correlate metrics with spans
- Add `trace.id` to high-cardinality metrics
- Enable trace → metrics → logs correlation

## Implementation Strategy

### Step 1: Redis Instrumentation
```typescript
// src/core/cache/redis.service.ts

import { trace, context, SpanStatusCode } from '@opentelemetry/api';

async get(key: string): Promise<string | null> {
  const tracer = trace.getTracer('redis-service');
  const span = tracer.startSpan('cache.get', {
    attributes: {
      'cache.operation': 'get',
      'cache.key': this.sanitizeKey(key),
    },
  });

  try {
    const value = await this.redis.get(key);
    span.setAttribute('cache.hit', value !== null);
    if (value) {
      span.setAttribute('cache.size', Buffer.byteLength(value));
    }
    span.setStatus({ code: SpanStatusCode.OK });
    return value;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

### Step 2: HTTP Interceptor
```typescript
// src/core/observability/interceptors/tracing.interceptor.ts

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const tracer = trace.getTracer('http-server');
    const request = context.switchToHttp().getRequest();
    
    const span = tracer.startSpan('http.request', {
      attributes: {
        'http.method': request.method,
        'http.route': request.route?.path,
        'http.url': request.url,
        'user.id': request.user?.id,
      },
    });

    return context.run(trace.setSpan(context.active(), span), () =>
      next.handle().pipe(
        tap(() => span.setStatus({ code: SpanStatusCode.OK })),
        catchError(error => {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        }),
        finalize(() => span.end()),
      ),
    );
  }
}
```

### Step 3: Business Operation Spans
```typescript
// Pattern for wrapping business methods

async login(loginDto: LoginDto): Promise<LoginResponse> {
  const tracer = trace.getTracer('auth-service');
  const span = tracer.startSpan('auth.login', {
    attributes: {
      'user.email': loginDto.email,
    },
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      // Child span for validation
      const user = await this.validateCredentials(loginDto);
      
      // Child span for session creation
      const session = await this.createSession(user);
      
      // Child span for token generation
      const tokens = await this.generateTokens(user, session);
      
      span.setStatus({ code: SpanStatusCode.OK });
      return { user, session, tokens };
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## Expected Outcomes

### Trace Visibility
- ✅ Complete request flow from HTTP → Service → Database → Cache
- ✅ Parent-child span relationships
- ✅ Operation durations at each layer
- ✅ Error propagation through spans
- ✅ Business context in span attributes

### Performance Insights
- Identify slow cache operations
- Detect cache miss patterns
- Measure business operation latency
- Find bottlenecks in workflows

### Example Trace Hierarchy
```
http.request (POST /api/auth/login) - 450ms
├── auth.login - 445ms
│   ├── auth.validate_credentials - 320ms
│   │   └── pg.query:SELECT (users) - 315ms
│   ├── auth.create_session - 85ms
│   │   ├── cache.get (session:user:123) - 2ms (MISS)
│   │   ├── pg.query:INSERT (sessions) - 78ms
│   │   └── cache.set (session:abc-def) - 3ms
│   └── auth.generate_tokens - 35ms
└── audit.log - 5ms
```

## Testing Plan

### Unit Tests
- Mock OpenTelemetry tracer
- Verify span creation
- Check attribute setting
- Test error handling

### Integration Tests
- Start app with tracing enabled
- Make authenticated requests
- Verify end-to-end traces
- Check span correlation

### Manual Testing
1. **Redis Operations**
   ```bash
   curl http://localhost:4040/api/countries
   # Should see cache.get and cache.set spans
   ```

2. **Authentication Flow**
   ```bash
   curl -X POST http://localhost:4040/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@kuybi.dev","password":"Admin@123"}'
   # Should see auth.login with child spans
   ```

3. **Story Creation**
   ```bash
   curl -X POST http://localhost:4040/api/stories \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"title":"Test","content":"..."}'
   # Should see story.create workflow
   ```

## Files to Modify

1. **RedisService** - `src/core/cache/redis.service.ts`
   - Add spans to all 10 methods
   - Add private helper `sanitizeKey()`

2. **TracingInterceptor** - `src/core/observability/interceptors/tracing.interceptor.ts` (NEW)
   - Implement HTTP request tracing
   - Add context propagation

3. **MetricsService** - `src/core/observability/metrics/metrics.service.ts`
   - Add trace context extraction
   - Link metrics with traces

4. **AuthService** - `src/modules/auth/services/auth.service.ts`
   - Add spans to login, logout, refresh

5. **StoriesService** - `src/modules/stories/services/stories.service.ts`
   - Add span to create method

6. **AttachmentsService** - `src/modules/attachments/services/attachments.service.ts`
   - Add span to upload method

7. **AppModule** - `src/app.module.ts`
   - Register TracingInterceptor globally

## Success Criteria

- ✅ All Redis operations traced
- ✅ HTTP requests wrapped in spans
- ✅ Auth flow fully instrumented
- ✅ At least 2 business operations instrumented
- ✅ Metrics linked with trace context
- ✅ Console output shows nested spans
- ✅ No performance degradation (target: <10% overhead)
- ✅ Documentation updated

## Timeline

**Day 1:**
- Morning: Redis instrumentation
- Afternoon: HTTP interceptor + testing

**Day 2:**
- Morning: Business operation spans (Auth)
- Afternoon: Business operation spans (Stories, Attachments)

**Day 3:**
- Morning: Metrics integration
- Afternoon: Testing, documentation, commit

## Next Phase Preview

**Phase 3 - Grafana Dashboards & Alerting** (Optional)
- Create Grafana dashboard templates
- Set up Prometheus scraping
- Configure alerting rules
- Visualize trace data

---

**Status:** 🏃 IN PROGRESS  
**Started:** November 5, 2025  
**ETA:** November 7-8, 2025
