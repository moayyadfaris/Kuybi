# Password History Metadata Fix

## Issue Summary

**Error**: `EntityMetadataNotFoundError: No metadata for "PasswordHistory" was found`

**Impact**: Password change operations failed with 500 error when attempting to check password history.

**Date**: 2025-11-06

## Root Cause Analysis

### The Problem

TypeORM requires entities to be registered in **two places** for full functionality:

1. **Module Level** (`TypeOrmModule.forFeature()`) - For dependency injection
2. **Root Level** (`TypeOrmModule.forRootAsync()`) - For DataSource metadata loading

The `PasswordHistory` entity was only registered in the AuthModule but **missing from DatabaseModule**, causing TypeORM to fail when trying to query the entity.

### Error Flow

```
POST /api/v1/auth/change-password
  ↓
AuthService.changePassword()
  ↓
PasswordHistoryRepository.findByUser()
  ↓
Repository.find() [TypeORM]
  ↓
DataSource.getMetadata('PasswordHistory')
  ↓
❌ EntityMetadataNotFoundError: No metadata for "PasswordHistory" was found
```

### Why It's Confusing

- ✅ **No DI errors** - Repository injection worked fine (registered in AuthModule)
- ✅ **Migration worked** - Table created successfully (entity in data-source.ts)
- ✅ **Database table exists** - Schema was correct
- ❌ **Runtime query failed** - TypeORM couldn't load entity metadata

## The Fix

### File: `src/core/database/database.module.ts`

**Added Import:**
```typescript
import { PasswordHistory } from '@modules/auth/entities/password-history.entity';
```

**Added to Entities Array:**
```typescript
entities: [
  Country,
  User,
  EmailVerification,
  Session,
  PasswordReset,
  PasswordHistory,  // ← ADDED THIS
  Attachment,
  Category,
  Story,
  // ... rest of entities
],
```

### Commit Details

- **Commit**: `c55af35`
- **Message**: `fix(database): Add PasswordHistory entity to root TypeORM config`
- **Files Changed**: 1 file, 2 insertions

## Verification

### Before Fix
```bash
curl -X POST http://localhost:4040/api/v1/auth/change-password
# Response: {"statusCode":500,"error":{"message":"No metadata for \"PasswordHistory\" was found"}}
```

### After Fix
```bash
curl -X POST http://localhost:4040/api/v1/auth/change-password
# Response: {"success":true,"sessionsRevoked":3,"notificationSent":true}
```

### Database Verification
```sql
SELECT COUNT(*) FROM password_history;
-- Result: 2 rows (entries saved correctly)
```

### Application Logs (Success)
```
INFO: Password history entry added and old entries cleaned
INFO: User changed password successfully
INFO: Email sent successfully
INFO: Password change notification email sent successfully
INFO: AUDIT: Password changed
```

## Debugging Process

### Steps Taken

1. ✅ **Verified database table exists** - `password_history` table present in `susanoo-nest` database
2. ✅ **Verified migration ran** - Migration `1699999999999-AddPasswordHistory` executed successfully
3. ❌ **Restarted application multiple times** - Error persisted
4. ✅ **Killed conflicting node processes** - Found 3 nest processes running simultaneously
5. ✅ **Checked AuthModule registration** - Entity correctly in `TypeOrmModule.forFeature()`
6. ✅ **Discovered missing DatabaseModule registration** - **ROOT CAUSE FOUND**
7. ✅ **Added entity to DatabaseModule** - Fixed metadata loading
8. ✅ **Rebuilt and restarted** - Application started successfully
9. ✅ **Tested password change** - All features working correctly

### Key Insight

The error message "No metadata found" points to **DataSource-level issues**, not module-level dependency injection. This indicates the entity needs to be in the root TypeORM configuration.

## Lessons Learned

### TypeORM Entity Registration Checklist

When creating a new entity, **ALWAYS** register in **THREE places**:

1. **Module Level** (Feature Module)
   ```typescript
   // src/modules/auth/auth.module.ts
   TypeOrmModule.forFeature([PasswordHistory])
   ```

2. **Root Level** (Database Module) ← **CRITICAL**
   ```typescript
   // src/core/database/database.module.ts
   entities: [Country, User, ..., PasswordHistory, ...]
   ```

3. **Migration CLI** (Data Source)
   ```typescript
   // src/core/database/data-source.ts
   entities: ['dist/**/*.entity{.ts,.js}'] // Or explicit array
   ```

### Warning Signs

If you see these symptoms, check DatabaseModule entity registration:

- ✅ Repository injection works (no DI errors)
- ✅ Migration creates table successfully
- ❌ Runtime queries fail with "No metadata found"
- ❌ TypeORM can't find entity in DataSource

### Prevention

Add this to code review checklist:

```markdown
- [ ] Entity added to feature module TypeOrmModule.forFeature()
- [ ] Entity added to DatabaseModule entities array
- [ ] Entity imported in database.module.ts
- [ ] Migration created for entity
- [ ] Migration tested (npm run migration:run)
```

## Related Features

This fix enabled three password security features to work correctly:

1. **Password Strength Validation** (score 0-4)
2. **Password History Tracking** (prevent reuse of last 5 passwords)
3. **Email Notifications** (notify user of password changes)

See: `docs/features/auth/PASSWORD_SECURITY_FEATURES.md`

## Impact

### Before Fix
- ❌ Password changes failed with 500 error
- ❌ No password history tracking
- ❌ Users could reuse old passwords
- ❌ No security audit trail

### After Fix
- ✅ Password changes work correctly
- ✅ Last 5 passwords tracked in database
- ✅ Users prevented from reusing old passwords
- ✅ Email notifications sent
- ✅ Full audit trail in logs
- ✅ Redis caching working

## Testing

### Manual Testing
```bash
# Test password change
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword":"OldPass@123",
    "newPassword":"NewSecure@2024!",
    "confirmPassword":"NewSecure@2024!",
    "invalidateAllSessions":true
  }'

# Expected: {"success":true,"sessionsRevoked":N,"notificationSent":true}
```

### Database Query
```sql
-- Check password history
SELECT "userId", COUNT(*) as password_count 
FROM password_history 
GROUP BY "userId";

-- View recent changes
SELECT * FROM password_history 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### Automated Testing
```bash
# Run test script
./test/scripts/test-password-security.sh
```

## References

- **TypeORM Documentation**: https://typeorm.io/entities
- **NestJS TypeORM Integration**: https://docs.nestjs.com/techniques/database
- **Original Feature Implementation**: Commit `bc7bf57`
- **Fix Commit**: Commit `c55af35`

## Related Documentation

- `docs/features/auth/PASSWORD_SECURITY_FEATURES.md` - Comprehensive feature guide
- `docs/architecture/REPOSITORY_PATTERN.md` - Repository pattern details
- `src/modules/auth/README.md` - Auth module documentation
