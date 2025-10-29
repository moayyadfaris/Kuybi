# Test Scripts

This directory contains manual integration test scripts for testing specific features end-to-end.

## Available Scripts

### ACL (Access Control List) Tests

#### Quick ACL Test
**Script:** `quick-acl-test.sh`

Fast validation of core ACL functionality.

**Usage:**
```bash
./test/scripts/quick-acl-test.sh
```

#### Full ACL Guard Tests
**Script:** `test-acl-guards.sh`

Comprehensive ACL guard validation with edge cases.

**Usage:**
```bash
./test/scripts/test-acl-guards.sh
```

**Additional ACL Scripts:**
- `quick-test-acl.sh` - Alternative quick ACL test
- `run-acl-tests.sh` - ACL test runner
- `test-acl.sh` - General ACL testing

---

### Audit Logging Tests

#### Audit API Test
**Script:** `test-audit-api.sh`

Tests audit logging API endpoints.

**Usage:**
```bash
./test/scripts/test-audit-api.sh
```

#### Audit Integration Test
**Script:** `test-audit-integration.sh`

Tests audit logging integration with Auth module.

**Usage:**
```bash
./test/scripts/test-audit-integration.sh
```

---

### Story Creation Test
**Script:** `test-story-creation.sh`

Tests story creation with tags and categories.

**Usage:**
```bash
./test/scripts/test-story-creation.sh
```

---

### Admin Password Management
**Script:** `test-admin-password.sh`

Tests admin password management functionality including:
- System-generated password reset
- Admin-defined password set
- Session invalidation
- Error handling (404, 400, weak passwords)
- Password validation

**Usage:**
```bash
# Ensure server is running on localhost:4000
npm run start:dev

# Run the test
./test/scripts/test-admin-password.sh
```

**Expected Output:**
- ✅ Admin password reset (system-generated)
- ✅ Admin password set (admin-defined)
- ✅ Session invalidation
- ✅ Error handling

---

### Force Password Change
**Script:** `test-force-password-change.sh`

Tests the complete force password change flow:
1. Admin resets user password
2. User login blocked with `requiresPasswordChange`
3. Temporary access token provided
4. User changes password
5. User can login normally

**Usage:**
```bash
# Ensure server is running on localhost:4000
npm run start:dev

# Run the test  
./test/scripts/test-force-password-change.sh
```

**Test Coverage:**
- ✅ Admin password reset
- ✅ Login blocked with requiresPasswordChange
- ✅ Temporary access token (15 min)
- ✅ Password change successful
- ✅ Login with new password
- ✅ Protected endpoints accessible
- ✅ Old sessions invalidated
- ✅ Validation errors:
  - Password mismatch
  - Wrong current password
  - Password reuse prevention
  - Weak password rejection

---

## Prerequisites

### Server Running
All scripts require the NestJS server to be running:
```bash
npm run start:dev
```

Server should be accessible at `http://localhost:4000`

### Admin User
Scripts use the default admin account:
- **Email:** admin@susano.dev
- **Password:** Admin@123

This account must exist in the database. Run database seeds if needed:
```bash
npm run db:seed:users
npm run db:seed:acl
```

### Dependencies
Scripts require:
- `curl` - HTTP requests
- `jq` - JSON parsing
- `bash` - Shell script execution

### Environment Variables
Scripts use:
- `BASE_URL`: Default `http://localhost:4000`
- `API_BASE`: Default `${BASE_URL}/v1`

## Running All Tests

```bash
# Run both test scripts
./test/scripts/test-admin-password.sh && ./test/scripts/test-force-password-change.sh
```

## Test Output

Scripts use colored output:
- 🟢 **GREEN** - Successful test
- 🔴 **RED** - Failed test
- 🟡 **YELLOW** - Test step/section
- 🔵 **BLUE** - Information/summary

## Troubleshooting

### Connection Refused
```
curl: (7) Failed to connect to localhost port 4000
```
**Solution:** Ensure server is running on port 4000

### 401 Unauthorized
```
{ "statusCode": 401, "message": "Unauthorized" }
```
**Solution:** 
- Check admin credentials are correct
- Ensure admin user exists in database
- Verify admin has Super Admin role

### jq: command not found
```
-bash: jq: command not found
```
**Solution:** Install jq
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

## Integration with CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Admin Password Tests
  run: |
    npm run start:dev &
    sleep 10  # Wait for server
    ./test/scripts/test-admin-password.sh
    ./test/scripts/test-force-password-change.sh
```

## Adding New Scripts

When adding new test scripts:

1. Create script in `test/scripts/`
2. Make executable: `chmod +x test/scripts/your-script.sh`
3. Add to this README
4. Follow naming convention: `test-feature-name.sh`
5. Use colored output for readability
6. Include cleanup if creating test data
7. Exit with non-zero code on failure

## Related Documentation

- [Admin Password Management](../../docs/features/users/ADMIN_PASSWORD_MANAGEMENT.md)
- [Force Password Change](../../docs/features/auth/FORCE_PASSWORD_CHANGE.md)
- [Integration Tests](../integration/README.md)
