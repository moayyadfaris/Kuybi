# NestJS v11 Migration Plan

## Research Summary

### Current State (v10.x)
- **NestJS Core**: v10.4.20 → **Target**: v11.1.7 (latest)
- **Node.js**: v22.12.0 ✅ (Compatible - v20+ required)
- **Express**: v4.x → **Target**: v5.x (bundled with NestJS v11)

### Key Breaking Changes in NestJS v11

#### 1. **Express v5 Integration** (CRITICAL)
- Express v5 is now the default platform
- **Impact**: Medium - affects route wildcards and query parsing
- **Action Required**: Review wildcard routes and query parameter handling

#### 2. **Node.js v20+ Required** ✅
- v16 and v18 no longer supported
- **Impact**: None - we're on v22.12.0

#### 3. **Cache Module (cache-manager v7)** (HIGH IMPACT)
- Migration to Keyv-based storage adapters
- **Impact**: HIGH - we use CacheConfigModule with @keyv/redis
- **Status**: ✅ Already using Keyv! (v3.0.1 → v5.1.3)

#### 4. **Config Module v4** (MEDIUM IMPACT)
- Configuration precedence changed
- Internal config now overrides environment variables
- **Impact**: Medium - review config loading order

#### 5. **Module Resolution Algorithm**
- Dynamic modules now use object references
- **Impact**: Low-Medium - may affect integration tests

#### 6. **Lifecycle Hooks Execution Order**
- Termination hooks now execute in reverse order
- **Impact**: Low - affects cleanup order

## Packages to Upgrade

### Critical NestJS Packages
```json
{
  "@nestjs/common": "10.4.20" → "11.1.7",
  "@nestjs/core": "10.4.20" → "11.1.7",
  "@nestjs/platform-express": "10.4.20" → "11.1.7",
  "@nestjs/config": "3.3.0" → "4.0.2",
  "@nestjs/swagger": "7.4.2" → "11.2.1",
  "@nestjs/typeorm": "10.0.2" → "11.0.0",
  "@nestjs/jwt": "10.2.0" → "11.0.1",
  "@nestjs/passport": "10.0.3" → "11.0.5",
  "@nestjs/terminus": "10.3.0" → "11.0.0",
  "@nestjs/throttler": "5.2.0" → "6.4.0"
}
```

### Dev Dependencies
```json
{
  "@nestjs/cli": "10.4.9" → "11.0.10",
  "@nestjs/schematics": "10.2.3" → "11.0.9",
  "@nestjs/testing": "10.4.20" → "11.1.7"
}
```

### Other Major Upgrades
```json
{
  "@keyv/redis": "3.0.1" → "5.1.3",
  "bcrypt": "5.1.1" → "6.0.0",
  "helmet": "7.2.0" → "8.1.0",
  "jest": "29.7.0" → "30.2.0",
  "eslint": "8.57.1" → "9.38.0",
  "typescript-eslint": "6.21.0" → "8.46.2"
}
```

## Migration Steps

### Phase 1: Pre-Migration Audit
1. ✅ **Review Route Wildcards**
   - Search for wildcard routes: `@Get('*')`, `forRoutes('*')`
   - Update to named wildcards: `@Get('*splat')`, `forRoutes('{*splat}')`

2. ✅ **Review Query Parameter Parsing**
   - Identify complex query params (nested objects/arrays)
   - Plan Express query parser configuration if needed

3. ✅ **Review Cache Module Usage**
   - Our CacheConfigModule already uses Keyv! ✅
   - Verify Redis connection string format

4. ✅ **Review Config Module Usage**
   - Document current config precedence assumptions
   - Test config loading with new precedence

### Phase 2: Backup & Preparation
```bash
# Create migration branch
git checkout -b feature/nestjs-v11-migration

# Backup current package.json
cp package.json package.json.v10.backup

# Backup package-lock.json
cp package-lock.json package-lock.json.v10.backup
```

### Phase 3: Update Dependencies
```bash
# Install npm-check-updates
npm install -g npm-check-updates

# Update NestJS packages to v11
ncu -u '@nestjs/*'

# Update other dependencies
ncu -u

# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Phase 4: Code Changes Required

#### 4.1 Express v5 Route Wildcards
**Search Pattern**: `@Get('*')`, `@Post('*')`, `.forRoutes('*')`

```typescript
// BEFORE (v10)
@Get('*')
fallback() { }

// AFTER (v11)
@Get('*splat')  // Named wildcard
fallback() { }

// For middleware
// BEFORE
.forRoutes('*')

// AFTER  
.forRoutes('{*splat}')  // Braces = optional (matches root too)
```

#### 4.2 Query Parameter Parsing (if using nested params)
```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Add this if using nested query params
  app.set('query parser', 'extended');
  
  // ... rest of setup
}
```

#### 4.3 Cache Module (Already Compatible!)
Our current `CacheConfigModule` already uses Keyv:
```typescript
// src/cache/cache.module.ts - ALREADY CORRECT ✅
const keyv = new Keyv(connectionString);
return {
  stores: [keyv],
  ttl: redisConfig.ttl * 1000,
}
```

Just upgrade `@keyv/redis` to v5.1.3.

#### 4.4 Config Module (@nestjs/config v4)
**New Precedence Order**:
1. Internal configuration (config namespaces/files)
2. Validated environment variables
3. process.env

**Changes**:
- `ignoreEnvVars` deprecated → use `validatePredefined: false`
- New `skipProcessEnv` option available

**Review**: Check if any config relies on env vars overriding internal config.

#### 4.5 Integration Tests (Module Resolution)
```typescript
// If tests fail due to multiple dynamic module instances:

// Option 1: Deduplicate modules manually
const typeOrmModule = TypeOrmModule.forRoot(config);

@Module({
  imports: [typeOrmModule],  // Reuse same instance
})

// Option 2: Use module.select()
const target = module.select(ParentModule).get(Target);

// Option 3: Get all instances
const targets = module.get(Target, { each: true });

// Option 4: Use old algorithm for tests
Test.createTestingModule(
  { /* ... */ },
  { moduleIdGeneratorAlgorithm: 'deep-hash' }
)
```

### Phase 5: Testing Strategy

#### 5.1 Unit Tests
```bash
npm run test
```
Expected: Minor adjustments for module resolution

#### 5.2 Integration Tests
```bash
npm run test:integration
```
**Watch for**:
- Dynamic module deduplication issues
- Lifecycle hook order changes
- Middleware execution order

#### 5.3 Manual Testing
1. Start application: `npm run start:dev`
2. Test authentication flows
3. Test file uploads (S3)
4. Test caching (Redis)
5. Test ACL permissions
6. Test story/category operations

### Phase 6: Validation Checklist

- [ ] Application starts without errors
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Authentication (login/logout/refresh) works
- [ ] ACL permissions work correctly
- [ ] File uploads work (S3)
- [ ] Redis caching works
- [ ] Database operations work
- [ ] Swagger docs accessible
- [ ] Health checks respond correctly
- [ ] Session management works
- [ ] Wildcard routes work (if any)
- [ ] Query parameter parsing works
- [ ] Middleware executes in correct order

## Risk Assessment

### LOW RISK ✅
- Node.js version (already v22)
- Cache module (already using Keyv)
- Most NestJS features (backward compatible)

### MEDIUM RISK ⚠️
- Config module precedence changes
- Module resolution in tests
- Express v5 wildcards (if used)
- Lifecycle hook order (if relied upon)

### HIGH RISK 🔴
- None identified for this codebase

## Rollback Plan

If migration fails:
```bash
# Restore package.json
cp package.json.v10.backup package.json
cp package-lock.json.v10.backup package-lock.json

# Reinstall v10 dependencies
rm -rf node_modules
npm install

# Revert code changes
git checkout -- .
```

## Timeline Estimate

- **Phase 1 (Audit)**: 2 hours
- **Phase 2 (Backup)**: 15 minutes
- **Phase 3 (Update Deps)**: 30 minutes
- **Phase 4 (Code Changes)**: 2-3 hours
- **Phase 5 (Testing)**: 3-4 hours
- **Phase 6 (Validation)**: 2 hours

**Total**: 10-12 hours

## Recommended Approach

### Option A: Incremental (RECOMMENDED)
1. Update NestJS packages only first
2. Test thoroughly
3. Update other dependencies
4. Test again

### Option B: All-at-once
1. Update everything simultaneously
2. Fix all issues at once
3. Higher risk but faster if successful

**Recommendation**: Use **Option A** for production codebase.

## Post-Migration Benefits

1. **Performance**: Improved module resolution algorithm
2. **Security**: Latest security patches in all packages
3. **Features**: Access to NestJS v11 features
4. **Express v5**: Better performance and modern syntax
5. **Type Safety**: Better TypeScript inference in v11
6. **Maintenance**: Staying current reduces future migration debt

## Resources

- [NestJS v11 Migration Guide](https://docs.nestjs.com/migration-guide)
- [NestJS v11 Release Notes](https://github.com/nestjs/nest/releases/tag/v11.0.0)
- [Express v5 Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
- [Keyv Documentation](https://keyv.org/)
- [NestJS v11 Announcement](https://trilon.io/blog/announcing-nestjs-11-whats-new)

## Next Steps

1. Review this migration plan
2. Schedule migration window
3. Create feature branch
4. Execute Phase 1 (Audit)
5. Decide on incremental vs all-at-once approach
6. Execute migration
7. Thorough testing
8. Deploy to staging
9. Final validation
10. Deploy to production
