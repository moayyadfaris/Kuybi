# Testing Approach: Jest vs Shell Scripts

## Executive Summary

**Use Jest E2E tests for all integration testing.** Shell scripts were created as quick prototypes but are not suitable for production testing.

## ✅ Recommended: Jest E2E Tests

### Location
- `test/*.e2e-spec.ts`
- Example: `test/admin-password-management.e2e-spec.ts`

### Advantages

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

### Example Structure

```typescript
describe('Admin Password Management (e2e)', () => {
  let app: INestApplication
  let adminToken: string

  beforeAll(async () => {
    // Setup test app
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    
    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    // Cleanup
    await app.close()
  })

  it('should reset user password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/users/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUserId })
      .expect(200)

    expect(response.body.data.temporaryPassword).toBeDefined()
  })
})
```

## ⚠️ Not Recommended: Shell Scripts

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
├── admin-password-management.e2e-spec.ts  ✅ Jest test (USE THIS)
├── force-password-change.e2e-spec.ts      ✅ Jest test (USE THIS)
└── scripts/
    ├── test-admin-password.sh             ⚠️  Shell script (for manual use only)
    └── test-force-password-change.sh      ⚠️  Shell script (for manual use only)
```

### Recommended Actions

1. **Primary Testing**: Always use Jest E2E tests
   ```bash
   npm run test:e2e
   ```

2. **Manual Testing**: Use shell scripts only when needed
   ```bash
   ./test/scripts/test-admin-password.sh
   ```

3. **CI/CD**: Configure only Jest tests
   ```yaml
   # .github/workflows/test.yml
   - name: Run E2E tests
     run: npm run test:e2e
   ```

4. **Future**: Consider deprecating shell scripts
   - Add deprecation notice to shell script headers
   - Remove from documentation
   - Eventually delete after Jest tests are stable

## Running Tests

### Jest E2E Tests (Recommended)

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- admin-password-management.e2e-spec.ts

# Run with watch mode
npm run test:e2e -- --watch

# Run with coverage
npm run test:e2e -- --coverage
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

### For Jest E2E Tests

1. **Use unique test data**
   ```typescript
   const testEmail = `test-${Date.now()}@example.com`
   ```

2. **Clean up after tests**
   ```typescript
   afterAll(async () => {
     if (testUserId) {
       await userRepository.delete(testUserId)
     }
   })
   ```

3. **Test full user flows**
   - Don't just test happy paths
   - Include error cases
   - Test authorization failures

4. **Keep tests independent**
   - Each test should work in isolation
   - Don't rely on execution order
   - Use beforeEach/afterEach for setup

5. **Use descriptive names**
   ```typescript
   it('should reject unauthorized password reset attempts', async () => {
     // Clear test description
   })
   ```

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

**Always prefer Jest E2E tests over shell scripts** for automated testing. Shell scripts are acceptable only for manual debugging and demonstration purposes. This ensures:

- Reliable CI/CD pipelines
- Maintainable test suite
- Better developer experience
- Comprehensive test coverage

For this admin password management feature:
- ✅ **Use**: `test/admin-password-management.e2e-spec.ts`
- ✅ **Use**: `test/force-password-change.e2e-spec.ts`
- ⚠️  **Rarely use**: `test/scripts/test-*.sh` (manual only)
