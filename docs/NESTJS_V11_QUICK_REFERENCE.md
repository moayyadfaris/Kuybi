# NestJS v11 Quick Migration Reference

## 🚀 Quick Start

```bash
# Run automated migration script
./scripts/migrate-to-v11.sh

# Or manually:
npm install -g npm-check-updates
ncu -u '@nestjs/*'
npm install
```

## 📋 Pre-Flight Checklist

- [x] Node.js v20+ (Current: v22.12.0) ✅
- [x] No wildcard routes (`*`) found ✅
- [x] Cache module already using Keyv ✅
- [ ] Review config precedence
- [ ] Test integration tests

## 🔧 Required Code Changes

### 1. **NO** Wildcard Routes Found ✅
No changes needed - no wildcards detected in codebase.

### 2. Cache Module Already Compatible ✅
`src/cache/cache.module.ts` already uses Keyv correctly. Just upgrade `@keyv/redis` to v5.

### 3. Config Module (Review Recommended)
**New precedence in v4**:
1. Internal config files
2. Validated env vars
3. process.env

**Action**: Test that env vars don't need to override internal config.

### 4. Integration Tests (Possible Adjustments)
If dynamic modules fail in tests, use one of:

```typescript
// Option 1: Reuse module instance
const typeOrmModule = TypeOrmModule.forRoot(config);
imports: [typeOrmModule, typeOrmModule]  // Same instance

// Option 2: Use old algorithm
Test.createTestingModule(
  { /* ... */ },
  { moduleIdGeneratorAlgorithm: 'deep-hash' }
)
```

## 📦 Package Updates

### Core NestJS (v10 → v11)
```bash
@nestjs/common: 10.4.20 → 11.1.7
@nestjs/core: 10.4.20 → 11.1.7
@nestjs/platform-express: 10.4.20 → 11.1.7
@nestjs/config: 3.3.0 → 4.0.2
@nestjs/swagger: 7.4.2 → 11.2.1
```

### Additional Updates
```bash
@keyv/redis: 3.0.1 → 5.1.3
bcrypt: 5.1.1 → 6.0.0 (BREAKING: review bcrypt.compare usage)
jest: 29.7.0 → 30.2.0
```

## ⚠️ Known Breaking Changes

### 1. **Express v5** (Auto-handled by NestJS)
- Wildcard routes need names: `*` → `*splat`
- **Status**: ✅ Not applicable (no wildcards found)

### 2. **bcrypt v6** (if upgrading)
```typescript
// May need adjustments to bcrypt.compare calls
// Review password comparison logic
```

### 3. **Config Module Precedence**
```typescript
// Internal config NOW overrides env vars
// Before: process.env → validated env → internal config
// After:  internal config → validated env → process.env
```

### 4. **Jest v30** (if upgrading)
Some test syntax may change. Review test output.

## 🧪 Testing Strategy

```bash
# 1. Build check
npm run build

# 2. Unit tests
npm run test

# 3. Integration tests (watch for dynamic module issues)
npm run test:integration

# 4. Manual testing
npm run start:dev

# Test these flows:
- Login/logout/refresh
- ACL permissions
- File uploads (S3)
- Redis caching
- Database operations
- Health checks
```

## 🔄 Rollback

```bash
# Restore backups
cp package.json.v10.backup package.json
cp package-lock.json.v10.backup package-lock.json

# Clean install
rm -rf node_modules
npm install
```

## 📊 Migration Status

### ✅ Low Risk Items
- [x] Node.js version compatible
- [x] No wildcard routes to update
- [x] Cache module already using Keyv
- [x] No Express v5 breaking changes apply

### ⚠️ Medium Risk Items
- [ ] Config module precedence change (test required)
- [ ] Integration test dynamic modules (may need adjustment)
- [ ] bcrypt v6 upgrade (if updating)
- [ ] Jest v30 (if updating)

### 🔴 High Risk Items
- None identified ✅

## 📝 Post-Migration Validation

```bash
# Start app
npm run start:dev

# Test endpoints
curl http://localhost:4000/api/health
curl -X POST http://localhost:4000/api/v1/auth/login

# Check Swagger
open http://localhost:4000/api/docs

# Monitor logs
npm run logs:view
```

## 🎯 Expected Outcome

**After successful migration**:
- All tests pass ✅
- Application starts without errors ✅
- All features work as before ✅
- Performance may improve slightly ✅
- Access to NestJS v11 features ✅

## 🆘 Troubleshooting

### Issue: Tests fail with "Cannot find module"
**Solution**: Clear jest cache
```bash
npm run test -- --clearCache
```

### Issue: Integration tests fail with duplicate providers
**Solution**: Use old module resolution algorithm
```typescript
Test.createTestingModule(
  { /* ... */ },
  { moduleIdGeneratorAlgorithm: 'deep-hash' }
)
```

### Issue: Config values not as expected
**Solution**: Review new config precedence order. Internal config now wins.

### Issue: bcrypt errors after upgrade
**Solution**: Review bcrypt.compare calls, may need syntax updates

## 📚 Resources

- [Full Migration Guide](./NESTJS_V11_MIGRATION.md)
- [NestJS Docs](https://docs.nestjs.com/migration-guide)
- [Express v5 Guide](https://expressjs.com/en/guide/migrating-5.html)

## ⏱️ Estimated Time

- **Preparation**: 30 min
- **Package updates**: 15 min
- **Code changes**: 1-2 hours (mostly testing)
- **Testing**: 2-3 hours
- **Total**: 4-6 hours

## 🎉 Quick Win!

**Good news**: This codebase is well-positioned for v11 migration!
- ✅ Already using Keyv (cache-manager v7 ready)
- ✅ No wildcard routes to update
- ✅ Modern Node.js version
- ✅ Clean architecture

**Recommended**: Start migration during low-traffic window, thorough testing recommended.
