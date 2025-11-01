# Error Response Standardization - Implementation Plan

## 📋 Overview

This document outlines a comprehensive plan to enhance error response standardization in the Kuybi NestJS application by implementing:

1. **Error Codes** - Machine-readable error identifiers for programmatic handling
2. **Error Categories** - Organized classification (validation, authentication, business logic, etc.)
3. **Retry Recommendations** - Smart guidance for handling transient errors

## 🎯 Goals

- **Developer Experience**: Enable programmatic error handling with consistent error codes
- **API Consumers**: Provide clear guidance on error categories and retry strategies
- **Monitoring**: Improve observability with categorized error tracking
- **Standards Compliance**: Align with industry standards (RFC 7807 Problem Details)
- **Backward Compatibility**: Maintain existing error response format while adding enhancements

## 📊 Current State Analysis

### Existing Error Handling

**Current Error Response Format:**
```json
{
  "success": false,
  "statusCode": 400,
  "path": "/api/v1/stories",
  "timestamp": "2025-10-31T00:00:00.000Z",
  "requestId": "abc-123",
  "error": {
    "message": "Error description",
    "details": ["validation error 1", "validation error 2"],
    "stack": "..." // development only
  }
}
```

**Current Implementation:**
- ✅ Global `HttpExceptionFilter` in `src/shared/filters/http-exception.filter.ts`
- ✅ Structured error responses with requestId correlation
- ✅ Environment-based stack traces (dev only)
- ✅ Sensitive data redaction (passwords, tokens, etc.)
- ✅ Validation error details array
- ⚠️ **Missing**: Error codes for programmatic handling
- ⚠️ **Missing**: Error categories for classification
- ⚠️ **Missing**: Retry recommendations for transient errors
- ⚠️ **Inconsistent**: HTTP exceptions thrown with string messages only

**Current Exception Usage Patterns:**
```typescript
// Examples from codebase:
throw new NotFoundException('Category not found')
throw new BadRequestException('File validation failed: ' + errors.join(', '))
throw new UnauthorizedException('Authentication required')
throw new ConflictException(`Category with slug '${slug}' already exists`)
```

## 🏗️ Proposed Architecture

### 1. Error Code System

**Structure:** `{MODULE}_{ERROR_TYPE}_{SPECIFIC_ERROR}`

**Examples:**
- `AUTH_INVALID_CREDENTIALS` - Invalid email/password
- `AUTH_TOKEN_EXPIRED` - JWT token expired
- `AUTH_SESSION_NOT_FOUND` - Session doesn't exist
- `CATEGORY_NOT_FOUND` - Category not found by ID
- `CATEGORY_SLUG_CONFLICT` - Duplicate category slug
- `STORY_VALIDATION_FAILED` - Story validation error
- `ATTACHMENT_SIZE_EXCEEDED` - File size limit exceeded
- `ATTACHMENT_INVALID_MIME` - Invalid MIME type
- `ACL_INSUFFICIENT_PERMISSIONS` - Permission denied
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `DATABASE_CONNECTION_FAILED` - Database error (transient)
- `CACHE_UNAVAILABLE` - Redis unavailable (transient)

### 2. Error Categories

Based on RFC 7807 and industry best practices:

| Category | Description | HTTP Status Range | Examples |
|----------|-------------|-------------------|----------|
| `validation` | Input validation failures | 400, 422 | Invalid email, missing required field |
| `authentication` | Authentication failures | 401 | Invalid credentials, token expired |
| `authorization` | Permission/access control | 403 | Insufficient permissions, resource ownership |
| `not_found` | Resource not found | 404 | Entity doesn't exist |
| `conflict` | Business rule violation | 409 | Duplicate slug, concurrent modification |
| `rate_limit` | Request throttling | 429 | Too many requests |
| `business_logic` | Domain-specific errors | 400, 422 | Insufficient credit, invalid state transition |
| `system` | Server/infrastructure errors | 500-503 | Database down, cache unavailable |
| `external_service` | Third-party API failures | 502, 503 | S3 unavailable, email service down |

### 3. Retry Strategy

**Retry-After Header Support:**
- RFC 7231 Section 7.1.3 compliant
- HTTP 429 (Rate Limit) - Always include retry-after
- HTTP 503 (Service Unavailable) - Include when known

**Error Metadata:**
```typescript
{
  retryable: boolean,
  retryAfter?: number,  // Seconds
  retryStrategy?: 'immediate' | 'exponential-backoff' | 'fixed-delay' | 'none'
}
```

**Retry Recommendations by Category:**
- `validation` - ❌ Not retryable (client must fix input)
- `authentication` - ⚠️ Retry only after re-authentication
- `authorization` - ❌ Not retryable (permission required)
- `not_found` - ❌ Not retryable (resource doesn't exist)
- `conflict` - ⚠️ Retry with exponential backoff (optimistic locking)
- `rate_limit` - ✅ Retry after delay (use Retry-After header)
- `system` - ✅ Retry with exponential backoff (transient error)
- `external_service` - ✅ Retry with exponential backoff

## 📐 Enhanced Response Format

### Proposed Format (RFC 7807 Inspired)

```typescript
{
  // Existing fields (backward compatible)
  success: false,
  statusCode: 400,
  path: "/api/v1/stories",
  timestamp: "2025-10-31T00:00:00.000Z",
  requestId: "abc-123",
  
  // Enhanced error object
  error: {
    // NEW: Machine-readable error code
    code: "STORY_VALIDATION_FAILED",
    
    // NEW: Error category
    category: "validation",
    
    // Existing: Human-readable message
    message: "Story validation failed",
    
    // Existing: Detailed validation errors (if applicable)
    details: [
      "title must be between 1 and 200 characters",
      "content should not be empty"
    ],
    
    // NEW: Retry metadata
    retryable: false,
    retryStrategy: "none",
    
    // Development only
    stack: "..."
  },
  
  // NEW: Retry-After header value (when applicable)
  retryAfter?: 60
}
```

### Transient Error Example

```typescript
{
  success: false,
  statusCode: 503,
  path: "/api/v1/stories",
  timestamp: "2025-10-31T00:00:00.000Z",
  requestId: "abc-123",
  error: {
    code: "DATABASE_CONNECTION_FAILED",
    category: "system",
    message: "Service temporarily unavailable",
    retryable: true,
    retryStrategy: "exponential-backoff",
    retryAfter: 5
  },
  retryAfter: 5
}
```

### Rate Limit Error Example

```typescript
{
  success: false,
  statusCode: 429,
  path: "/api/v1/stories",
  timestamp: "2025-10-31T00:00:00.000Z",
  requestId: "abc-123",
  error: {
    code: "RATE_LIMIT_EXCEEDED",
    category: "rate_limit",
    message: "Too many requests",
    retryable: true,
    retryStrategy: "fixed-delay",
    retryAfter: 60
  },
  retryAfter: 60
}
```

## 🛠️ Implementation Plan

### Phase 1: Core Infrastructure (3-4 days)

**1.1 Error Code Registry (Day 1)**
- Create `src/shared/errors/error-codes.enum.ts`
- Define error code enums organized by module
- Create error code to category mapping
- Create error code to retry strategy mapping

```typescript
// src/shared/errors/error-codes.enum.ts
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  SESSION_NOT_FOUND = 'AUTH_SESSION_NOT_FOUND',
  // ...
}

export enum CategoryErrorCode {
  NOT_FOUND = 'CATEGORY_NOT_FOUND',
  SLUG_CONFLICT = 'CATEGORY_SLUG_CONFLICT',
  // ...
}

// Union type for all error codes
export type ErrorCode = AuthErrorCode | CategoryErrorCode | /* ... */;
```

**1.2 Error Category System (Day 1)**
- Create `src/shared/errors/error-categories.enum.ts`
- Define ErrorCategory enum
- Create category metadata (HTTP status mappings, retry strategies)

```typescript
// src/shared/errors/error-categories.enum.ts
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  EXTERNAL_SERVICE = 'external_service'
}
```

**1.3 Custom Exception Classes (Day 2)**
- Create base `ApplicationException` class
- Create category-specific exception classes
- Include error code, category, and retry metadata

```typescript
// src/shared/errors/application.exception.ts
export class ApplicationException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    public readonly category: ErrorCategory,
    message: string,
    statusCode: number,
    public readonly retryable: boolean = false,
    public readonly retryStrategy: RetryStrategy = 'none',
    public readonly retryAfter?: number
  ) {
    super({ message, errorCode, category }, statusCode);
  }
}
```

**1.4 Enhanced HTTP Exception Filter (Day 2-3)**
- Update `src/shared/filters/http-exception.filter.ts`
- Extract error code, category, retry metadata from exceptions
- Build enhanced error response
- Add Retry-After header when applicable
- Maintain backward compatibility

**1.5 Error Response DTOs (Day 3)**
- Create `src/shared/dto/error-response.dto.ts`
- Define TypeScript interfaces for error responses
- Add Swagger/OpenAPI documentation

### Phase 2: Module Integration (4-5 days)

**2.1 Auth Module (Day 1)**
- Replace string-based exceptions with `ApplicationException`
- Define auth error codes and categories
- Examples:
  - `AUTH_INVALID_CREDENTIALS` - authentication, not retryable
  - `AUTH_TOKEN_EXPIRED` - authentication, retryable after re-auth
  - `AUTH_SESSION_NOT_FOUND` - not_found, not retryable

**2.2 Categories Module (Day 1)**
- Update CategoriesService exceptions
- Examples:
  - `CATEGORY_NOT_FOUND` - not_found, not retryable
  - `CATEGORY_SLUG_CONFLICT` - conflict, retryable with backoff

**2.3 Stories Module (Day 2)**
- Update StoriesService exceptions
- Examples:
  - `STORY_VALIDATION_FAILED` - validation, not retryable
  - `STORY_NOT_FOUND` - not_found, not retryable

**2.4 Attachments Module (Day 2)**
- Update AttachmentService and S3Service exceptions
- Examples:
  - `ATTACHMENT_SIZE_EXCEEDED` - validation, not retryable
  - `ATTACHMENT_S3_UNAVAILABLE` - external_service, retryable

**2.5 ACL Module (Day 3)**
- Update ACL guards and services
- Examples:
  - `ACL_INSUFFICIENT_PERMISSIONS` - authorization, not retryable
  - `ACL_AUTHENTICATION_REQUIRED` - authentication, not retryable

### Phase 3: Infrastructure Errors (2-3 days)

**3.1 Database Error Handling (Day 1)**
- Wrap TypeORM errors with transient error codes
- Examples:
  - `DATABASE_CONNECTION_FAILED` - system, retryable
  - `DATABASE_QUERY_TIMEOUT` - system, retryable
  - `DATABASE_CONSTRAINT_VIOLATION` - validation, not retryable

**3.2 Cache Error Handling (Day 1)**
- Wrap Redis errors with transient error codes
- Examples:
  - `CACHE_UNAVAILABLE` - system, retryable
  - `CACHE_CONNECTION_TIMEOUT` - system, retryable

**3.3 External Service Errors (Day 2)**
- S3 errors (already partially handled)
- Email service errors
- Examples:
  - `S3_SERVICE_UNAVAILABLE` - external_service, retryable
  - `EMAIL_SERVICE_UNAVAILABLE` - external_service, retryable

### Phase 4: Documentation & Testing (2-3 days)

**4.1 API Documentation (Day 1)**
- Update Swagger/OpenAPI schemas
- Document all error codes
- Add error code examples to endpoint docs
- Create error code reference guide

**4.2 Error Handling Guide (Day 1)**
- Create `docs/guides/ERROR_HANDLING.md`
- Document error response format
- Provide retry strategy examples
- Include client implementation examples

**4.3 Integration Tests (Day 2)**
- Test error responses include correct codes
- Test retry metadata is correct
- Test Retry-After header
- Test backward compatibility

**4.4 Update Existing Docs (Day 3)**
- Update `docs/API_REFERENCE.md`
- Add error handling section to feature docs
- Update ENTERPRISE_PROGRESS.md

### Phase 5: Monitoring Integration (1-2 days)

**5.1 Sentry Integration (Day 1)**
- Add error code and category to Sentry tags
- Group errors by error code
- Track retryable vs non-retryable errors

**5.2 Metrics & Analytics (Day 1)**
- Track error codes in application metrics
- Monitor retry rates
- Alert on high transient error rates

## 📊 Error Code Catalog (Preliminary)

### Authentication (`AUTH_*`)
- `AUTH_INVALID_CREDENTIALS` - Invalid email/password (401, authentication, not retryable)
- `AUTH_TOKEN_EXPIRED` - JWT token expired (401, authentication, retryable after re-auth)
- `AUTH_TOKEN_INVALID` - Malformed JWT token (401, authentication, not retryable)
- `AUTH_TOKEN_BLACKLISTED` - Token has been revoked (401, authentication, not retryable)
- `AUTH_SESSION_NOT_FOUND` - Session doesn't exist (404, not_found, not retryable)
- `AUTH_SESSION_EXPIRED` - Session has expired (401, authentication, retryable after re-auth)
- `AUTH_ACCOUNT_INACTIVE` - User account is inactive (403, authorization, not retryable)
- `AUTH_EMAIL_NOT_VERIFIED` - Email verification required (403, authorization, not retryable)

### Authorization (`ACL_*`)
- `ACL_AUTHENTICATION_REQUIRED` - Not authenticated (401, authentication, not retryable)
- `ACL_INSUFFICIENT_PERMISSIONS` - Missing required permissions (403, authorization, not retryable)
- `ACL_RESOURCE_FORBIDDEN` - Access to resource denied (403, authorization, not retryable)

### Categories (`CATEGORY_*`)
- `CATEGORY_NOT_FOUND` - Category not found by ID (404, not_found, not retryable)
- `CATEGORY_SLUG_CONFLICT` - Duplicate category slug (409, conflict, retryable with backoff)
- `CATEGORY_VALIDATION_FAILED` - Category validation error (400, validation, not retryable)
- `CATEGORY_CANNOT_DELETE` - Category has dependencies (409, business_logic, not retryable)

### Stories (`STORY_*`)
- `STORY_NOT_FOUND` - Story not found by ID (404, not_found, not retryable)
- `STORY_VALIDATION_FAILED` - Story validation error (400, validation, not retryable)
- `STORY_UNAUTHORIZED` - Not owner of story (403, authorization, not retryable)
- `STORY_VERSION_CONFLICT` - Optimistic locking conflict (409, conflict, retryable with backoff)

### Attachments (`ATTACHMENT_*`)
- `ATTACHMENT_NOT_FOUND` - Attachment not found (404, not_found, not retryable)
- `ATTACHMENT_SIZE_EXCEEDED` - File size limit exceeded (400, validation, not retryable)
- `ATTACHMENT_INVALID_MIME` - Invalid MIME type (400, validation, not retryable)
- `ATTACHMENT_VALIDATION_FAILED` - File validation failed (400, validation, not retryable)
- `ATTACHMENT_S3_UNAVAILABLE` - S3 service unavailable (503, external_service, retryable)
- `ATTACHMENT_UPLOAD_FAILED` - Upload failed (500, system, retryable)

### Tags (`TAG_*`)
- `TAG_NOT_FOUND` - Tag not found by ID (404, not_found, not retryable)
- `TAG_VALIDATION_FAILED` - Tag validation error (400, validation, not retryable)

### System (`SYSTEM_*`)
- `SYSTEM_INTERNAL_ERROR` - Unexpected server error (500, system, not retryable)
- `SYSTEM_SERVICE_UNAVAILABLE` - Service temporarily down (503, system, retryable)

### Database (`DATABASE_*`)
- `DATABASE_CONNECTION_FAILED` - Cannot connect to database (503, system, retryable)
- `DATABASE_QUERY_TIMEOUT` - Query execution timeout (503, system, retryable)
- `DATABASE_CONSTRAINT_VIOLATION` - Database constraint violated (400, validation, not retryable)

### Cache (`CACHE_*`)
- `CACHE_UNAVAILABLE` - Redis cache unavailable (503, system, retryable)
- `CACHE_CONNECTION_TIMEOUT` - Cache connection timeout (503, system, retryable)

### Rate Limiting (`RATE_*`)
- `RATE_LIMIT_EXCEEDED` - Too many requests (429, rate_limit, retryable with fixed delay)
- `RATE_LIMIT_DAILY_QUOTA` - Daily quota exceeded (429, rate_limit, retryable after reset)

## 🔄 Migration Strategy

### Backward Compatibility

1. **Existing error responses remain valid**
   - All existing fields preserved
   - New fields are additive only

2. **Gradual rollout**
   - Phase 1-2: Infrastructure + core modules
   - Phase 3: Remaining modules
   - Phase 4-5: Documentation and monitoring

3. **Deprecation timeline**
   - Old format supported indefinitely
   - New format encouraged in docs
   - No breaking changes

### Client Migration

**Before (still works):**
```typescript
try {
  await api.createStory(data);
} catch (error) {
  if (error.statusCode === 400) {
    // Handle validation error
  }
}
```

**After (enhanced):**
```typescript
try {
  await api.createStory(data);
} catch (error) {
  // Programmatic error handling
  if (error.code === 'STORY_VALIDATION_FAILED') {
    // Handle specific validation error
  }
  
  // Retry logic
  if (error.retryable && error.retryStrategy === 'exponential-backoff') {
    await retryWithBackoff(() => api.createStory(data));
  }
}
```

## 📈 Success Metrics

1. **Developer Experience**
   - Reduced time to debug API errors
   - Improved error handling code quality
   - Positive developer feedback

2. **API Quality**
   - Reduced support tickets for error interpretation
   - Improved client retry success rates
   - Better error monitoring insights

3. **Technical Metrics**
   - 100% error code coverage across modules
   - 95%+ test coverage for error scenarios
   - Zero breaking changes to existing clients

## 🎯 Deliverables

### Code
- [ ] Error code enums and registry
- [ ] Error category system
- [ ] Custom exception classes
- [ ] Enhanced HTTP exception filter
- [ ] Updated service exceptions (all modules)
- [ ] Error response DTOs

### Documentation
- [ ] Error handling guide
- [ ] Error code reference
- [ ] API documentation updates
- [ ] Client implementation examples
- [ ] Migration guide

### Testing
- [ ] Unit tests for exception classes
- [ ] Integration tests for error responses
- [ ] E2E tests for retry scenarios
- [ ] Backward compatibility tests

## 📅 Timeline

- **Week 1**: Phase 1 (Core Infrastructure) + Phase 2 Start
- **Week 2**: Phase 2 Complete (Module Integration) + Phase 3 Start
- **Week 3**: Phase 3 Complete + Phase 4 (Documentation & Testing)
- **Week 4**: Phase 5 (Monitoring) + Final Review

**Total Estimated Time**: 3-4 weeks

## 🔗 References

- [RFC 7807: Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc7807)
- [RFC 7231: HTTP/1.1 Semantics (Retry-After)](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.3)
- [Microsoft API Guidelines](https://github.com/microsoft/api-guidelines)
- [Google API Design Guide - Errors](https://cloud.google.com/apis/design/errors)

## 📝 Notes

- This plan maintains 100% backward compatibility
- Error codes follow consistent naming convention
- Retry strategies based on error category
- Aligns with industry standards (RFC 7807)
- Integrates with existing Sentry monitoring
- Supports both development and production environments
