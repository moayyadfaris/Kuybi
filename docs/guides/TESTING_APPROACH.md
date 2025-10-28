# Testing Approach: Integration Tests vs Shell Scripts

## Executive Summary

**Use integration tests in `test/integration/` directory following the established patterns.** Shell scripts are only for manual debugging.

## ✅ Recommended: Jest Integration Tests

### Location & Structure
```
test/
├── integration/
│   └── auth/
│       └── auth.integration.spec.ts    ✅ All auth tests here
├── helpers/
│   ├── test-database.ts                Helper for database operations
│   ├── test-module.ts                  Helper for module creation
│   └── test-redis.ts                   Helper for Redis operations
├── factories/
│   ├── user.factory.ts                 User test data factory
│   └── story.factory.ts                Story test data factory
└── scripts/
    └── *.sh                            ⚠️  Manual testing only
```

### Testing Patterns Used

1. **Single Test File per Module**
   - All auth-related tests in `auth.integration.spec.ts`
   - All story-related tests in `stories.integration.spec.ts`

2. **Factories for Test Data**
   ```typescript
   const testUser = await UserFactory.createWithHashedPassword({
     password: TEST_PASSWORD,
   });
   ```

3. **Shared Setup/Teardown**
   ```typescript
   beforeEach(async () => {
     // Clear database tables
     await dataSource.query(`TRUNCATE TABLE ...`);
     // Clear cache
     await TestRedis.clearCache();
     // Create test data
     testUser = await userRepository.save(...);
   });
   ```

4. **Real Database & Redis**
   - Uses test database (configured in `test.config.ts`)
   - Uses ioredis-mock for Redis
   - Truncates tables between tests
   ```

1. **Automated Testing**
   - Runs with `npm run test:e2e`
   - Integrates with CI/CD pipelines
   - Part of the standard test suite

2. **Better Assertions**
   - TypeScript type safety
   - Rich assertion library
   - Clear test descriptions

3. **Test Isolation**
   - Setup and teardown hooks
   - Database cleanup
   - No side effects

4. **Developer Experience**
   - IDE integration
   - Debugging support
   - Watch mode for development

5. **Coverage Reports**
   - Tracks test coverage
   - Identifies untested code
   - Quality metrics

4. **Real Database & Redis**
   - Uses test database (configured in `test.config.ts`)
   - Uses ioredis-mock for Redis
   - Truncates tables between tests

### Admin Password Management Example

All admin password tests are in `test/integration/auth/auth.integration.spec.ts`:

```typescript
describe('Admin Password Management', () => {
  describe('POST /api/admin/users/reset-password', () => {
    it('should reset user password with system-generated password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUser.id,
          forcePasswordChange: true,
          reason: 'Integration test',
        })
        .expect(201);

      expect(response.body).toHaveProperty('temporaryPassword');
      expect(response.body.temporaryPassword).toHaveLength(12);
    });
  });

  describe('Force Password Change Flow', () => {
    it('should detect force password change flag on login', async () => {
      // Test implementation
    });
  });
});
```

### Advantages

### Location
- `test/scripts/*.sh`
- Example: `test/scripts/test-admin-password.sh`

### Why They Were Created

Shell scripts were initially created for:
- Quick manual testing during development
- Demonstrating API flows to non-developers
- Debugging authentication issues quickly

### Problems

1. **Not Automated**
   - Must be run manually
   - Easy to forget
   - No CI/CD integration

2. **Fragile**
   - Hard to maintain
   - Break easily with API changes
   - No type safety

3. **Poor Error Handling**
   - Generic error messages
   - Hard to debug failures
   - No stack traces

4. **No Test Isolation**
   - Creates real database records
   - Can pollute test data
   - May fail due to duplicates

5. **Environment Specific**
   - Hardcoded URLs and ports
   - Platform dependencies (bash, jq, curl)
   - May not work in CI environments

### When to Use Shell Scripts

Shell scripts are acceptable ONLY for:
- **Manual exploratory testing** - Quick API exploration
- **Local debugging** - Debugging auth flows manually
- **Documentation** - Showing API usage examples
- **Demo purposes** - Demonstrating features to stakeholders

**Never use shell scripts in CI/CD or as the primary test suite.**

## Migration Path

### Current State (Feature Branch)

```
test/
├── integration/
│   └── auth/
│       └── auth.integration.spec.ts     ✅ Contains ALL auth tests including:
│                                           - Login/logout tests
│                                           - Token refresh tests
│                                           - Admin password management tests
│                                           - Force password change flow tests
└── scripts/
    ├── test-admin-password.sh            ⚠️  Shell script (manual use only)
    └── test-force-password-change.sh     ⚠️  Shell script (manual use only)
```

### Recommended Actions

1. **Primary Testing**: Use integration tests following existing patterns
   ```bash
   npm run test:integration
   ```

2. **Manual Testing**: Use shell scripts only when needed
   ```bash
   ./test/scripts/test-admin-password.sh
   ```

3. **CI/CD**: Configure integration tests
   ```yaml
   # .github/workflows/test.yml
   - name: Run Integration tests
     run: npm run test:integration
   ```

4. **Future**: Consider deprecating shell scripts
   - Add deprecation notice to shell script headers
   - Remove from documentation
   - Eventually delete after Jest tests are stable

## Running Tests

### Integration Tests (Recommended)

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm run test:integration -- auth.integration.spec.ts

# Run with watch mode (if configured)
npm run test:integration -- --watch

# Run with coverage
npm run test:integration -- --coverage
```

### Shell Scripts (Manual Only)

```bash
# Ensure server is running first
npm run start:dev

# Then in another terminal
./test/scripts/test-admin-password.sh
./test/scripts/test-force-password-change.sh
```

## Best Practices

### For Integration Tests

1. **Add tests to existing files**
   ```typescript
   // Add to test/integration/auth/auth.integration.spec.ts
   describe('New Auth Feature', () => {
     it('should work correctly', async () => {
       // Test implementation
     });
   });
   ```

2. **Use factories for test data**
   ```typescript
   const testUser = await UserFactory.createWithHashedPassword({
     email: `test${testCounter}@example.com`,
     password: TEST_PASSWORD,
   });
   ```

3. **Follow existing cleanup patterns**
   ```typescript
   beforeEach(async () => {
     // Truncate tables
     await dataSource.query(`TRUNCATE TABLE ...`);
     // Clear cache
     await TestRedis.clearCache();
     // Create test data
   });
   ```

4. **Test full user flows**
   - Don't just test happy paths
   - Include error cases
   - Test authorization failures

5. **Keep tests independent**
   - Each test should work in isolation
   - Use beforeEach for setup
   - Don't rely on execution order

### For Shell Scripts (If Used)

1. **Add disclaimer at top**
   ```bash
   # ⚠️  FOR MANUAL TESTING ONLY
   # Use Jest E2E tests for automated testing
   ```

2. **Make idempotent**
   - Use unique timestamps
   - Handle existing data gracefully

3. **Document prerequisites**
   - Server must be running
   - Database must be seeded
   - Specific environment variables

## Conclusion

**Always add tests to existing integration test files** following the established patterns. Shell scripts are acceptable only for manual debugging and demonstration purposes. This ensures:

- Consistent test structure
- Reliable CI/CD pipelines
- Maintainable test suite
- Better developer experience
- Comprehensive test coverage

For this admin password management feature:
- ✅ **Use**: `test/integration/auth/auth.integration.spec.ts` (all tests added here)
- ⚠️  **Rarely use**: `test/scripts/test-*.sh` (manual only)
