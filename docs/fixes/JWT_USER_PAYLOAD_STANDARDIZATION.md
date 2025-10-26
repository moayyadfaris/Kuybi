# JWT User Payload Standardization Fix

## Issue
Super admin authentication was failing with "User not authenticated" error when creating stories, despite valid JWT token.

## Root Cause
Inconsistency between JWT strategy output and controller expectations:

**JWT Strategy** (`jwt.strategy.ts`) was returning:
```typescript
{
  userId: payload.sub,  // ← userId field
  email: payload.email,
  role: payload.role
}
```

**Stories Controller** was expecting:
```typescript
interface AuthenticatedRequest extends Request {
  user?: {
    id: string,  // ← id field (MISMATCH!)
    email: string
  }
}
```

## Solution
Standardized all controllers to use `userId` field to match JWT strategy output.

### Files Modified

#### 1. `src/stories/stories.controller.ts`
**Changed interface:**
```typescript
// Before
interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

// After
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
  }
}
```

**Updated all methods (13 occurrences):**
```typescript
// Before
const userId = req.user?.id

// After
const userId = req.user?.userId
```

Methods affected:
- ✅ `create()`
- ✅ `findOne()`
- ✅ `update()`
- ✅ `updateStatus()`
- ✅ `remove()`
- ✅ `hardDelete()`
- ✅ `restore()`
- ✅ `attachAttachments()`
- ✅ `detachAttachments()`
- ✅ `attachTags()`
- ✅ `detachTags()`
- ✅ `attachCategories()`
- ✅ `detachCategories()`

## Verification

### Already Correct
These files were already using `userId` correctly:
- ✅ `src/attachments/controllers/attachments.controller.ts`
- ✅ `src/auth/sessions.controller.ts`

### Testing
Test with the provided curl command:
```bash
curl --location 'http://localhost:4040/api/v1/stories' \
--header 'Authorization: Bearer <token>' \
--header 'Content-Type: application/json' \
--data '{
    "title": "Title heading 1",
    "details": "This is a sample story",
    "type": "REPORT",
    "status": "DRAFT",
    "priority": "NORMAL",
    "tags": ["politcs", "economy"]
}'
```

Expected result: Story created successfully (no "User not authenticated" error)

## Architectural Notes

### JWT Payload Structure
```typescript
// Token payload (from auth.service.ts)
const payload = { 
  sub: user.id,      // Subject = user ID
  email: user.email, 
  role: user.role 
}

// Extracted by JWT strategy
{
  userId: payload.sub,  // sub becomes userId
  email: payload.email,
  role: payload.role
}
```

### Standard AuthenticatedRequest Interface
Going forward, all controllers should use this consistent interface:
```typescript
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}
```

## Related Files
- `src/auth/strategies/jwt.strategy.ts` - Returns user payload with `userId`
- `src/auth/services/auth.service.ts` - Generates JWT with `sub` claim
- All controller files using JWT authentication

## Prevention
To prevent similar issues in the future:

1. **Create shared type**: Consider creating a shared `AuthenticatedUser` type in `src/types/auth.ts`
2. **Code review**: Check interface consistency when adding JWT guards
3. **Testing**: Always test authentication flow for new protected endpoints

---

**Fixed**: October 26, 2025  
**Impact**: All story creation and management endpoints  
**Status**: ✅ Resolved - All compilation errors cleared
