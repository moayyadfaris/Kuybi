# Account Lockout Feature

## Overview

Automated account lockout system that protects user accounts from brute-force attacks by tracking failed login attempts and temporarily locking accounts that exceed the configured threshold. Integrates with Bull queues for delayed unlock operations and sends email notifications to users.

## Features

- ✅ Tracks failed login attempts per user
- ✅ Automatically locks accounts after configurable threshold
- ✅ Scheduled automatic unlock via Bull queue
- ✅ Email notifications on lock and unlock events
- ✅ Configurable lockout duration and attempt reset period
- ✅ Optional IP address tracking
- ✅ Admin manual unlock capability
- ✅ Periodic cleanup of expired locks
- ✅ Full audit logging with structured context

## Architecture

### Components

1. **AccountLockoutService** (`src/modules/auth/services/account-lockout.service.ts`)
   - Core business logic for account lockout operations
   - Handles failed attempt tracking, locking, and unlocking
   - Integrates with Bull queue for delayed operations
   - Sends email notifications via EmailService

2. **AccountSecurityProcessor** (`src/core/queues/processors/account-security.processor.ts`)
   - Bull queue processor for security-related jobs
   - Handles AUTO_UNLOCK, RESET_FAILED_ATTEMPTS, CHECK_EXPIRED_LOCKS
   - Runs as part of the worker process

3. **Database Migration** (`1730730000000-AddAccountLockoutFields.ts`)
   - Adds lockout fields to users table
   - Creates indexes for efficient queries

4. **Email Templates** (`account-locked.hbs`, `account-unlocked.hbs`)
   - Professional HTML email templates
   - Consistent with existing application design

### Data Model

#### User Entity Fields

```typescript
failedLoginAttempts: number          // Default: 0, incremented on each failed attempt
isLocked: boolean                    // Default: false, true when locked
lockedAt: Date | null                // Timestamp when account was locked
lockedUntil: Date | null             // Timestamp when account will auto-unlock
lockReason: string | null            // FAILED_ATTEMPTS | ADMIN_LOCK | SECURITY_VIOLATION
```

#### Indexes

```sql
-- Index on isLocked for quick filtering
CREATE INDEX IDX_USERS_IS_LOCKED ON users (isLocked)

-- Partial index on lockedUntil for finding unlockable accounts
CREATE INDEX IDX_USERS_LOCKED_UNTIL ON users (lockedUntil) WHERE lockedUntil IS NOT NULL

-- Composite index for finding expired locks
CREATE INDEX IDX_USERS_LOCKED_STATUS ON users (isLocked, lockedUntil)
```

### Queue Architecture

#### ACCOUNT_SECURITY Queue

```typescript
{
  name: 'account-security-queue',
  priority: 8,              // High priority (security-critical)
  rateLimiter: {
    max: 100,              // Max 100 jobs per minute
    duration: 60000
  },
  attempts: 3,             // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',
    delay: 5000            // 5s initial delay
  }
}
```

#### Job Types

1. **UNLOCK_ACCOUNT**
   - Automatically unlocks account after lockout duration expires
   - Resets all lockout fields
   - Sends unlock email notification

2. **RESET_FAILED_ATTEMPTS**
   - Resets failed attempt counter after reset period
   - Only executes if account is not locked

3. **CHECK_EXPIRED_LOCKS**
   - Periodic job to clean up expired locks
   - Batch processes locked accounts with past `lockedUntil` dates

## Configuration

### Environment Variables

```bash
# Enable/disable feature
ACCOUNT_LOCKOUT_ENABLED=true

# Number of failed attempts before lock (default: 5)
ACCOUNT_LOCKOUT_MAX_ATTEMPTS=5

# Lockout duration in milliseconds (default: 30 minutes)
ACCOUNT_LOCKOUT_DURATION=1800000

# Period to reset attempts if no new failures (default: 15 minutes)
ACCOUNT_LOCKOUT_RESET_PERIOD=900000

# Track failed attempts by IP address (default: true)
ACCOUNT_LOCKOUT_TRACK_IP=true

# Send email notification on lockout (default: true)
ACCOUNT_LOCKOUT_NOTIFY_LOCK=true

# Send email notification on unlock (default: true)
ACCOUNT_LOCKOUT_NOTIFY_UNLOCK=true
```

### Configuration Object

```typescript
{
  security: {
    accountLockout: {
      enabled: boolean,              // Feature toggle
      maxAttempts: number,           // 5 failed attempts
      lockDuration: number,          // 30 minutes in ms
      resetAttemptsPeriod: number,   // 15 minutes in ms
      trackByIpAddress: boolean,     // Track by IP
      notifyOnLockout: boolean,      // Send lock email
      notifyOnUnlock: boolean        // Send unlock email
    }
  }
}
```

## Usage

### AuthService Integration

The lockout system is automatically integrated into the authentication flow:

```typescript
// In AuthService.validateUser()
async validateUser(email: string, password: string, context?: SessionContext) {
  const user = await this.usersService.findByEmail(email)
  
  // 1. Check if account is locked
  if (await this.accountLockoutService.isAccountLocked(user.id)) {
    const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)
    throw new UnauthorizedException(`Account locked until ${lockInfo.lockedUntil}`)
  }
  
  // 2. Validate password
  if (!validPassword) {
    await this.accountLockoutService.recordFailedAttempt(user.id, context?.ipAddress)
    throw new UnauthorizedException('Invalid credentials')
  }
  
  // 3. Success - reset attempts
  await this.accountLockoutService.resetFailedAttempts(user.id)
  return user
}
```

### AccountLockoutService Methods

#### Record Failed Attempt

```typescript
await accountLockoutService.recordFailedAttempt(userId, ipAddress?)
```

- Increments `failedLoginAttempts` counter
- If threshold exceeded, locks account automatically
- Schedules unlock job in queue
- Sends lockout email notification

#### Check Lockout Status

```typescript
const isLocked = await accountLockoutService.isAccountLocked(userId)
```

- Returns `true` if account is locked
- Auto-unlocks if `lockedUntil` has passed
- Efficient query using indexed fields

#### Get Lockout Information

```typescript
const info = await accountLockoutService.getAccountLockInfo(userId)
// Returns: LockoutInfo
{
  isLocked: boolean,
  failedAttempts: number,
  maxAttempts: number,
  lockedAt?: Date,
  lockedUntil?: Date,
  lockReason?: string,
  remainingAttempts: number
}
```

#### Manual Unlock (Admin)

```typescript
await accountLockoutService.adminUnlockAccount(userId, adminId)
```

- Immediately unlocks account
- Logs admin action for audit
- Sends unlock email notification

#### Unlock Expired Accounts (Cron)

```typescript
await accountLockoutService.unlockExpiredAccounts()
```

- Batch unlocks accounts with past `lockedUntil` dates
- Typically called via cron job or periodic queue job

#### Get Locked Accounts (Admin)

```typescript
const accounts = await accountLockoutService.getLockedAccounts(limit, offset)
```

- Returns paginated list of locked accounts
- Used for admin dashboard

## Email Notifications

### Account Locked Email

Sent when account is locked after exceeding failed attempt threshold.

**Template**: `account-locked.hbs`

**Context Variables**:
- `userName`: User's display name
- `userEmail`: User's email address
- `lockedAt`: Timestamp when locked
- `lockedUntil`: Timestamp when will auto-unlock
- `failedAttempts`: Number of failed attempts
- `ipAddress`: Last failed login IP
- `appName`: Application name
- `supportEmail`: Support email address
- `securityEmail`: Security team email
- `resetPasswordUrl`: Link to password reset

### Account Unlocked Email

Sent when account is unlocked (automatic or manual).

**Template**: `account-unlocked.hbs`

**Context Variables**:
- `userName`: User's display name
- `userEmail`: User's email address
- `unlockedAt`: Timestamp when unlocked
- `unlockType`: "Automatic (Timer Expired)" or "Manual (Admin)"
- `wasAutomatic`: Boolean flag
- `previousAttempts`: Number of failed attempts before lock
- `loginUrl`: Link to login page
- `changePasswordUrl`: Link to change password

## Workflow Examples

### Scenario 1: Failed Login Attempts Leading to Lockout

1. **Attempt 1-4**: User enters wrong password
   ```
   POST /auth/login → 401 Unauthorized
   User.failedLoginAttempts = 1, 2, 3, 4
   ```

2. **Attempt 5**: Fifth failed attempt triggers lockout
   ```
   POST /auth/login → 401 Unauthorized
   User.failedLoginAttempts = 5
   User.isLocked = true
   User.lockedAt = 2024-11-04 10:00:00
   User.lockedUntil = 2024-11-04 10:30:00
   User.lockReason = 'FAILED_ATTEMPTS'
   
   Queue Job: UNLOCK_ACCOUNT scheduled for 10:30:00
   Email: account-locked.hbs sent to user
   ```

3. **Attempt 6**: User tries to login while locked
   ```
   POST /auth/login → 401 "Account locked until 10:30:00 AM"
   ```

4. **10:30:00**: Queue job executes
   ```
   Job: UNLOCK_ACCOUNT processed
   User.isLocked = false
   User.failedLoginAttempts = 0
   User.lockedAt = null
   User.lockedUntil = null
   User.lockReason = null
   
   Email: account-unlocked.hbs sent to user
   ```

5. **User can login**: Account is unlocked
   ```
   POST /auth/login → 200 OK
   ```

### Scenario 2: Successful Login After Failed Attempts

1. **Attempt 1-3**: User enters wrong password
   ```
   User.failedLoginAttempts = 1, 2, 3
   Queue Job: RESET_FAILED_ATTEMPTS scheduled for +15min
   ```

2. **Attempt 4**: User remembers correct password
   ```
   POST /auth/login → 200 OK
   User.failedLoginAttempts = 0  // Reset on success
   Queue Job: RESET_FAILED_ATTEMPTS cancelled or no-op
   ```

### Scenario 3: Admin Manual Unlock

1. **Account is locked** (5 failed attempts)
   ```
   User.isLocked = true
   User.lockedUntil = 2024-11-04 15:00:00
   ```

2. **Admin unlocks account** (e.g., after user contact support)
   ```
   POST /admin/unlock-account/:userId
   User.isLocked = false
   User.failedLoginAttempts = 0
   
   Audit Log: Admin XYZ unlocked user ABC at 14:30:00
   Email: account-unlocked.hbs sent (unlockType: "Manual (Admin)")
   ```

## Testing

### Manual Testing

1. **Test Lockout Flow**:
   ```bash
   # Login with wrong password 5 times
   curl -X POST http://localhost:4000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"wrong"}'
   
   # 6th attempt should return lockout error
   # Email should be sent to user
   
   # Wait 30 minutes (or check worker logs for auto-unlock)
   
   # Login should work again
   ```

2. **Test Auto-Reset of Attempts**:
   ```bash
   # Login with wrong password 3 times
   # Wait 15 minutes
   # Attempts should reset to 0
   # Login with wrong password again - counter starts at 1
   ```

### Integration Tests

```typescript
describe('Account Lockout', () => {
  it('should lock account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@test.com', password: 'wrong' })
        .expect(401)
    }
    
    const user = await usersService.findByEmail('user@test.com')
    expect(user.isLocked).toBe(true)
    expect(user.failedLoginAttempts).toBe(5)
  })
  
  it('should unlock account after lockout duration', async () => {
    // ... lock account
    
    // Simulate time passing (or trigger queue job)
    await accountSecurityProcessor.handleUnlockAccount({
      userId: user.id,
      reason: 'AUTO_UNLOCK',
      lockedAt: user.lockedAt,
      timestamp: new Date().toISOString()
    })
    
    const unlockedUser = await usersService.findById(user.id)
    expect(unlockedUser.isLocked).toBe(false)
  })
})
```

## Monitoring & Logging

### Structured Logs

All operations are logged with structured context:

```json
{
  "level": "warn",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "failedAttempts": 5,
  "lockedAt": "2024-11-04T10:00:00Z",
  "lockedUntil": "2024-11-04T10:30:00Z",
  "lockReason": "FAILED_ATTEMPTS",
  "action": "account_locked",
  "message": "Account locked due to FAILED_ATTEMPTS"
}
```

### Metrics to Monitor

- **Account lockouts per hour**: Track frequency of lockouts
- **Auto-unlock success rate**: Ensure queue jobs execute properly
- **Failed attempt patterns**: Detect brute-force attacks
- **Email delivery failures**: Monitor notification system health

## Security Considerations

### Protection Against Attacks

1. **Brute Force Protection**: Primary goal - prevent password guessing
2. **Rate Limiting**: Queue limits prevent flood of unlock jobs
3. **IP Tracking**: Optional feature to track attack sources
4. **Audit Logging**: All lockout events are logged for forensics

### Privacy & Compliance

1. **Email PII**: Emails contain user's email address and login times
2. **IP Address Storage**: Optional, can be disabled via config
3. **Data Retention**: Lockout data is temporary and auto-cleared

### Potential Issues

1. **Legitimate User Lockout**: Users who forget passwords may be locked out
   - Mitigation: Short lockout duration (30 min), password reset link in email

2. **Distributed Attacks**: Different IPs targeting same account
   - Mitigation: Track by userId, not just IP

3. **Queue Failures**: If worker crashes, auto-unlock may not execute
   - Mitigation: Queue persistence, job retries, manual unlock capability

## Troubleshooting

### Account Won't Unlock

**Issue**: Account remains locked after lockout duration passes

**Solutions**:
1. Check worker process is running: `pm2 status`
2. Check queue for pending jobs: `await queue.getJobs(['delayed'])`
3. Manually unlock: `await accountLockoutService.unlockAccount(userId, 'ADMIN_UNLOCK')`
4. Check `lockedUntil` timestamp in database

### Emails Not Sending

**Issue**: Users not receiving lockout/unlock emails

**Solutions**:
1. Check email service configuration
2. Verify SMTP credentials
3. Check email logs: `grep 'lockout email' logs/combined.log`
4. Test email service: `await emailService.testConnection()`

### Too Many False Positives

**Issue**: Legitimate users frequently locked out

**Solutions**:
1. Increase `maxAttempts`: `ACCOUNT_LOCKOUT_MAX_ATTEMPTS=10`
2. Decrease lockout duration: `ACCOUNT_LOCKOUT_DURATION=600000` (10 min)
3. Increase reset period: `ACCOUNT_LOCKOUT_RESET_PERIOD=1800000` (30 min)

## Future Enhancements

### Potential Improvements

1. **CAPTCHA Integration**: Add CAPTCHA after 3 failed attempts
2. **Geo-blocking**: Block login attempts from suspicious regions
3. **Device Fingerprinting**: Allow trusted devices to bypass limits
4. **Adaptive Lockout**: Increase lockout duration for repeated violations
5. **SMS Notifications**: Alternative to email for critical alerts
6. **Admin Dashboard**: Web UI for managing locked accounts
7. **Analytics**: Track attack patterns and generate reports

### API Endpoints (Future)

```typescript
GET    /api/v1/auth/account-status        // Check own account status
POST   /api/v1/auth/unlock-request        // Request early unlock
GET    /api/v1/admin/locked-accounts      // List locked accounts
POST   /api/v1/admin/unlock/:userId       // Manual unlock
GET    /api/v1/admin/lockout-stats        // Security statistics
```

## References

- **Migration**: `src/core/database/migrations/1730730000000-AddAccountLockoutFields.ts`
- **Service**: `src/modules/auth/services/account-lockout.service.ts`
- **Processor**: `src/core/queues/processors/account-security.processor.ts`
- **Queue Config**: `src/core/queues/config/queue.config.ts`
- **Configuration**: `src/config/configuration.ts`
- **Email Templates**: `src/infrastructure/email/templates/account-*.hbs`
- **Integration**: `src/modules/auth/services/auth.service.ts`

## Changelog

### Version 1.0 (2024-11-04)

- ✅ Initial implementation
- ✅ Database migration with indexed fields
- ✅ AccountLockoutService with full feature set
- ✅ AccountSecurityProcessor with 3 job types
- ✅ Email notification system
- ✅ Configurable via environment variables
- ✅ Integrated into authentication flow
- ✅ Full audit logging
- ✅ Queue-based delayed unlock
- ✅ Admin manual unlock capability
