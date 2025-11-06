# Password Security - Future Features

## Overview

This document outlines planned password security enhancements that are **not yet implemented** but are recommended for future development. These features will further strengthen the authentication system and improve compliance with security standards.

**Status**: 📋 Planning Phase  
**Last Updated**: November 6, 2025  
**Priority**: Medium to High

---

## 🔐 Security Enhancements

### 1. Password Expiry & Rotation Policies

**Priority**: High  
**Estimated Effort**: 4-6 hours  
**Dependencies**: Database migration for new User fields

#### Description
Implement automatic password expiration based on configurable policies. Force users to change passwords periodically to minimize the risk of compromised credentials.

#### Technical Implementation

**Database Changes:**
```typescript
// Add to User entity
@Column({ type: 'timestamp', nullable: true })
passwordExpiresAt: Date

@Column({ type: 'timestamp', nullable: true })
passwordChangedAt: Date

@Column({ type: 'boolean', default: false })
mustChangePassword: boolean

@Column({ type: 'integer', nullable: true })
passwordExpiryDays: number // Override role default
```

**Configuration:**
```typescript
// src/config/configuration.ts
auth: {
  passwordExpiry: {
    enabled: process.env.ENABLE_PASSWORD_EXPIRY === 'true',
    defaultDays: parseInt(process.env.PASSWORD_EXPIRY_DAYS, 10) || 90,
    warningDays: parseInt(process.env.PASSWORD_EXPIRY_WARNING_DAYS, 10) || 7,
    roleOverrides: {
      admin: 60,
      user: 90,
      guest: 180
    }
  }
}
```

**Service Methods:**
```typescript
class PasswordExpiryService {
  async checkPasswordExpiry(userId: string): Promise<ExpiryStatus> {
    const user = await this.usersRepository.findById(userId)
    const daysSinceChange = differenceInDays(new Date(), user.passwordChangedAt)
    const expiryDays = user.passwordExpiryDays || this.getDefaultExpiryDays(user.role)
    
    return {
      isExpired: daysSinceChange >= expiryDays,
      daysUntilExpiry: expiryDays - daysSinceChange,
      shouldWarn: daysSinceChange >= (expiryDays - 7)
    }
  }
  
  async forcePasswordChange(userId: string, reason: string): Promise<void>
  
  async sendExpiryWarnings(): Promise<void> // Cron job
}
```

**Middleware:**
```typescript
@Injectable()
export class PasswordExpiryMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const user = req.user
    if (user?.mustChangePassword) {
      throw new ForbiddenException({
        message: 'Password change required',
        code: 'PASSWORD_EXPIRED',
        redirectTo: '/auth/change-password'
      })
    }
    next()
  }
}
```

#### API Endpoints

- `GET /api/v1/auth/password-expiry-status` - Check expiry status
- `POST /api/v1/admin/users/:userId/force-password-change` - Admin force change
- `GET /api/v1/admin/password-expiry/report` - Expiry compliance report

#### Benefits

- ✅ Reduces risk of stale credentials
- ✅ Compliance with security standards (SOC2, ISO 27001)
- ✅ Configurable per role
- ✅ Automatic warning notifications

---

### 2. Multi-Factor Authentication (MFA) Requirement

**Priority**: High  
**Estimated Effort**: 12-16 hours  
**Dependencies**: TOTP library, QR code generation

#### Description
Require MFA verification before critical operations like password changes. Support TOTP (Google Authenticator, Authy), SMS, and email OTP.

#### Technical Implementation

**Database Changes:**
```typescript
// Add to User entity
@Column({ type: 'boolean', default: false })
mfaEnabled: boolean

@Column({ type: 'varchar', nullable: true })
mfaSecret: string // Encrypted TOTP secret

@Column({ type: 'json', nullable: true })
mfaBackupCodes: string[] // Encrypted backup codes

@Column({ type: 'enum', enum: ['totp', 'sms', 'email'], nullable: true })
mfaMethod: string
```

**Services:**
```typescript
class MfaService {
  async generateTotpSecret(userId: string): Promise<{ secret: string, qrCode: string }>
  
  async verifyTotp(userId: string, code: string): Promise<boolean>
  
  async sendSmsOtp(userId: string): Promise<void>
  
  async sendEmailOtp(userId: string): Promise<void>
  
  async generateBackupCodes(userId: string): Promise<string[]>
  
  async verifyBackupCode(userId: string, code: string): Promise<boolean>
}
```

**Enhanced Password Change:**
```typescript
async changePassword(..., mfaCode?: string) {
  // Verify MFA if enabled for user
  if (user.mfaEnabled) {
    const isValid = await this.mfaService.verifyTotp(user.id, mfaCode)
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code')
    }
  }
  
  // For admin users, always require MFA
  if (user.roles.includes('admin') && !mfaCode) {
    throw new UnauthorizedException('MFA required for admin password changes')
  }
  
  // Continue with password change...
}
```

#### API Endpoints

- `POST /api/v1/auth/mfa/enable` - Enable MFA
- `POST /api/v1/auth/mfa/verify` - Verify MFA setup
- `POST /api/v1/auth/mfa/disable` - Disable MFA (requires MFA verification)
- `GET /api/v1/auth/mfa/backup-codes` - Generate backup codes
- `POST /api/v1/auth/mfa/send-otp` - Send SMS/Email OTP

#### Configuration

```env
ENABLE_MFA=true
MFA_REQUIRED_FOR_ADMINS=true
MFA_OTP_EXPIRY_SECONDS=300
```

#### Benefits

- ✅ Prevents unauthorized password changes
- ✅ Protection against credential stuffing
- ✅ Compliance requirement for many standards
- ✅ Multiple MFA methods supported

---

### 3. Password Complexity Tiers

**Priority**: Medium  
**Estimated Effort**: 4-6 hours  
**Dependencies**: Enhanced PasswordStrengthService

#### Description
Different password requirements based on user role, with custom dictionaries for organization-specific banned words.

#### Technical Implementation

```typescript
interface PasswordRequirements {
  minLength: number
  minScore: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  bannedTerms: string[]
  maxRepeatingChars: number
  preventCommonPatterns: boolean
}

class PasswordStrengthService {
  private readonly roleRequirements: Record<string, PasswordRequirements> = {
    admin: {
      minLength: 16,
      minScore: 4, // Very strong only
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bannedTerms: [],
      maxRepeatingChars: 2,
      preventCommonPatterns: true
    },
    user: {
      minLength: 12,
      minScore: 3, // Strong
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bannedTerms: [],
      maxRepeatingChars: 3,
      preventCommonPatterns: true
    },
    guest: {
      minLength: 8,
      minScore: 2, // Fair
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      bannedTerms: [],
      maxRepeatingChars: 4,
      preventCommonPatterns: false
    }
  }
  
  async calculateStrength(
    password: string, 
    context: {
      userRole?: string
      companyName?: string
      userName?: string
      email?: string
    }
  ): Promise<StrengthResult> {
    const requirements = this.roleRequirements[context.userRole] || this.roleRequirements.user
    
    // Add context-specific banned terms
    const bannedTerms = [
      ...requirements.bannedTerms,
      context.companyName?.toLowerCase(),
      context.userName?.toLowerCase(),
      context.email?.split('@')[0].toLowerCase(),
      'kuybi',
      'password',
      'admin'
    ].filter(Boolean)
    
    return this.evaluate(password, requirements, bannedTerms)
  }
}
```

#### Configuration

```env
# Role-based requirements (JSON)
PASSWORD_REQUIREMENTS_ADMIN='{"minLength":16,"minScore":4}'
PASSWORD_REQUIREMENTS_USER='{"minLength":12,"minScore":3}'
PASSWORD_REQUIREMENTS_GUEST='{"minLength":8,"minScore":2}'

# Custom banned terms (comma-separated)
PASSWORD_BANNED_TERMS=company,organization,kuybi
```

---

## 📊 User Experience Features

### 4. Suspicious Activity Alerts

**Priority**: High  
**Estimated Effort**: 8-10 hours  
**Dependencies**: GeoIP service, Email templates

#### Description
Detect unusual password change patterns and alert users of potentially unauthorized changes with ability to lock account.

#### Technical Implementation

```typescript
class SuspiciousActivityService {
  async detectSuspiciousPasswordChange(
    user: User,
    context: ChangeContext
  ): Promise<SuspiciousActivityResult> {
    const recentSessions = await this.sessionsRepository.findRecentByUser(
      user.id,
      30 // Last 30 days
    )
    
    const checks = {
      isNewIP: this.checkNewIP(context.ipAddress, recentSessions),
      isUnusualTime: this.checkUnusualTime(new Date()),
      isDifferentCountry: await this.checkDifferentCountry(user, context),
      isNewDevice: this.checkNewDevice(context.userAgent, recentSessions),
      isImpossibleTravel: await this.checkImpossibleTravel(user, context)
    }
    
    const riskScore = this.calculateRiskScore(checks)
    
    if (riskScore >= 0.7) { // High risk threshold
      await this.sendSecurityAlert(user, {
        type: 'suspicious_password_change',
        riskScore,
        reasons: Object.entries(checks)
          .filter(([_, value]) => value)
          .map(([key]) => key),
        context,
        actionUrl: this.generateSecurityActionUrl(user.id)
      })
    }
    
    return { isSuspicious: riskScore >= 0.7, riskScore, checks }
  }
  
  private checkImpossibleTravel(user: User, context: ChangeContext): Promise<boolean> {
    // Check if user traveled too fast between locations
    // e.g., logged in from US 1 hour ago, now from China
  }
  
  private generateSecurityActionUrl(userId: string): string {
    const token = this.tokenService.generateSecurityActionToken(userId)
    return `${this.configService.get('app.url')}/auth/security-action?token=${token}`
  }
}
```

**Email Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Security Alert - Password Changed</title>
</head>
<body>
  <h2>⚠️ Your password was recently changed</h2>
  <p>We detected a password change on your account:</p>
  <ul>
    <li><strong>Time:</strong> {{timestamp}}</li>
    <li><strong>Location:</strong> {{city}}, {{country}}</li>
    <li><strong>IP Address:</strong> {{ipAddress}}</li>
    <li><strong>Device:</strong> {{device}}</li>
  </ul>
  
  <p><strong>⚠️ This change appears suspicious because:</strong></p>
  <ul>
    {{#if isNewLocation}}<li>New location detected</li>{{/if}}
    {{#if isUnusualTime}}<li>Changed at unusual time</li>{{/if}}
    {{#if isDifferentCountry}}<li>Different country than usual</li>{{/if}}
  </ul>
  
  <p>
    <a href="{{actionUrl}}&action=confirm" style="background:#28a745;color:#fff;padding:10px 20px;text-decoration:none;">
      This was me
    </a>
    <a href="{{actionUrl}}&action=lock" style="background:#dc3545;color:#fff;padding:10px 20px;text-decoration:none;margin-left:10px;">
      Lock my account
    </a>
  </p>
</body>
</html>
```

#### Benefits

- ✅ Early detection of account takeovers
- ✅ User-friendly security response
- ✅ Reduces impact of credential theft
- ✅ Builds user trust

---

### 5. Password Strength Meter (Real-time)

**Priority**: Low  
**Estimated Effort**: 4-6 hours  
**Dependencies**: WebSocket gateway

#### Description
Real-time password strength feedback via WebSocket as user types, reducing API calls and improving UX.

#### Technical Implementation

```typescript
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true
  }
})
export class PasswordStrengthGateway {
  constructor(
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly logger: PinoLogger
  ) {}
  
  @SubscribeMessage('check-password-strength')
  async handlePasswordCheck(
    @MessageBody() data: { password: string, context?: any },
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    try {
      const strength = await this.passwordStrengthService.calculateStrength(
        data.password,
        data.context || {}
      )
      
      client.emit('password-strength-result', {
        success: true,
        data: strength
      })
    } catch (error) {
      client.emit('password-strength-error', {
        success: false,
        error: error.message
      })
    }
  }
  
  @SubscribeMessage('disconnect')
  handleDisconnect(client: Socket) {
    this.logger.info({ clientId: client.id }, 'Client disconnected from password strength')
  }
}
```

**Frontend Example:**
```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:4040')

passwordInput.addEventListener('input', (e) => {
  socket.emit('check-password-strength', { 
    password: e.target.value,
    context: { userRole: 'admin' }
  })
})

socket.on('password-strength-result', (result) => {
  updateStrengthMeter(result.data)
})
```

---

## 🔔 Notification Enhancements

### 6. Multi-Channel Notifications

**Priority**: Medium  
**Estimated Effort**: 8-10 hours  
**Dependencies**: SMS service, Push notification service, Webhook service

#### Description
Send password change notifications via multiple channels: email, SMS, push notifications, and webhooks for enterprise integrations.

#### Technical Implementation

```typescript
class NotificationService {
  async notifyPasswordChange(
    user: User, 
    context: ChangeContext
  ): Promise<NotificationResults> {
    const notifications: Promise<any>[] = []
    const results: NotificationResults = {
      email: { sent: false, error: null },
      sms: { sent: false, error: null },
      push: { sent: false, error: null },
      webhook: { sent: false, error: null }
    }
    
    // Email (always sent)
    notifications.push(
      this.sendEmailNotification(user, context)
        .then(() => { results.email.sent = true })
        .catch(error => { results.email.error = error.message })
    )
    
    // SMS (if enabled for user)
    if (user.smsNotificationsEnabled && user.phoneNumber) {
      notifications.push(
        this.sendSmsNotification(user, context)
          .then(() => { results.sms.sent = true })
          .catch(error => { results.sms.error = error.message })
      )
    }
    
    // Push notifications (if tokens exist)
    if (user.pushTokens?.length) {
      notifications.push(
        this.sendPushNotification(user, context)
          .then(() => { results.push.sent = true })
          .catch(error => { results.push.error = error.message })
      )
    }
    
    // Webhook (for enterprise customers)
    if (user.organization?.webhookUrl) {
      notifications.push(
        this.sendWebhook(user, context)
          .then(() => { results.webhook.sent = true })
          .catch(error => { results.webhook.error = error.message })
      )
    }
    
    await Promise.allSettled(notifications)
    
    return results
  }
  
  private async sendSmsNotification(user: User, context: ChangeContext): Promise<void> {
    await this.smsService.send(
      user.phoneNumber,
      `Your ${this.config.get('app.name')} password was changed. ` +
      `If this wasn't you, contact support immediately.`
    )
  }
  
  private async sendPushNotification(user: User, context: ChangeContext): Promise<void> {
    await this.pushService.sendToDevices(user.pushTokens, {
      title: 'Password Changed',
      body: 'Your account password was recently changed',
      data: {
        type: 'password_change',
        timestamp: context.timestamp,
        location: context.location
      }
    })
  }
  
  private async sendWebhook(user: User, context: ChangeContext): Promise<void> {
    await this.webhookService.send(user.organization.webhookUrl, {
      event: 'user.password_changed',
      userId: user.id,
      timestamp: new Date(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    })
  }
}
```

#### Configuration

```env
# SMS Notifications
ENABLE_SMS_NOTIFICATIONS=true
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# Push Notifications
ENABLE_PUSH_NOTIFICATIONS=true
PUSH_PROVIDER=firebase
FIREBASE_PROJECT_ID=xxx
FIREBASE_PRIVATE_KEY=xxx

# Webhook Notifications
ENABLE_WEBHOOK_NOTIFICATIONS=true
WEBHOOK_TIMEOUT_MS=5000
```

---

## 📈 Audit & Compliance

### 7. Password Policy Compliance Dashboard

**Priority**: Medium  
**Estimated Effort**: 6-8 hours  
**Dependencies**: Admin panel, Chart.js or similar

#### Description
Admin dashboard showing organization-wide password health metrics, compliance statistics, and actionable insights.

#### Technical Implementation

```typescript
@Controller('admin/password-compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'compliance_officer')
export class PasswordComplianceController {
  @Get('dashboard')
  async getDashboard(): Promise<ComplianceDashboard> {
    const users = await this.usersRepository.findAll()
    const passwordHistory = await this.passwordHistoryRepository.findAll()
    
    return {
      summary: {
        totalUsers: users.length,
        usersWithExpiredPasswords: this.countExpiredPasswords(users),
        usersWithWeakPasswords: await this.countWeakPasswords(users),
        usersReusingPasswords: await this.countPasswordReuse(users),
        breachedPasswordsDetected: await this.countBreachedPasswords(users),
        mfaAdoptionRate: this.calculateMfaAdoption(users)
      },
      trends: {
        passwordChangesThisMonth: this.countRecentChanges(passwordHistory, 30),
        averagePasswordAge: this.calculateAverageAge(users),
        averagePasswordStrength: await this.calculateAverageStrength(users)
      },
      alerts: {
        expiringInSevenDays: this.getExpiringPasswords(users, 7),
        weakPasswordUsers: await this.getWeakPasswordUsers(users),
        nonMfaAdmins: this.getNonMfaAdmins(users)
      },
      compliance: {
        soc2Compliant: this.checkSoc2Compliance(users),
        iso27001Compliant: this.checkIso27001Compliance(users),
        gdprCompliant: this.checkGdprCompliance(users)
      }
    }
  }
  
  @Get('export')
  async exportComplianceReport(@Query() query: ExportQuery): Promise<Buffer> {
    const report = await this.generateComplianceReport(query)
    return this.exportService.toCsv(report)
  }
}
```

**Dashboard Metrics:**
- Total users
- Expired passwords count
- Weak passwords count
- Password reuse violations
- MFA adoption rate
- Average password age
- Breach detection results
- Compliance status (SOC2, ISO 27001, GDPR)

---

## 🚀 Advanced Features

### 8. Passwordless Authentication

**Priority**: Low  
**Estimated Effort**: 16-20 hours  
**Dependencies**: WebAuthn library, Email service

#### Description
Implement passwordless login options using magic links and WebAuthn/FIDO2 for enhanced security and user experience.

#### Technical Implementation

**Magic Links:**
```typescript
@Controller('auth')
export class AuthController {
  @Post('passwordless/initiate')
  async initiatePasswordlessLogin(@Body() dto: { email: string }): Promise<void> {
    const user = await this.usersRepository.findByEmail(dto.email)
    if (!user) {
      // Don't reveal if user exists
      return { message: 'If an account exists, a magic link has been sent' }
    }
    
    const token = await this.tokenService.generateMagicLink(user.id, {
      expiresIn: '15m'
    })
    
    await this.emailService.sendMagicLink(user.email, token)
    
    return { message: 'Check your email for a login link' }
  }
  
  @Get('passwordless/verify')
  async verifyMagicLink(@Query('token') token: string): Promise<AuthResponse> {
    const payload = await this.tokenService.verifyMagicLink(token)
    
    // Generate session
    const session = await this.sessionsService.createSession(payload.userId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    })
    
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    }
  }
}
```

**WebAuthn/FIDO2:**
```typescript
@Controller('auth/webauthn')
export class WebAuthnController {
  @Post('register/start')
  @UseGuards(JwtAuthGuard)
  async startRegistration(@Req() req: AuthenticatedRequest) {
    const user = req.user
    
    const options = await this.webAuthnService.generateRegistrationOptions({
      rpName: 'Kuybi',
      rpID: 'kuybi.com',
      userID: user.userId,
      userName: user.email,
      userDisplayName: user.name
    })
    
    // Store challenge in session
    await this.sessionStore.set(
      `webauthn:challenge:${user.userId}`,
      options.challenge,
      { ttl: 300 }
    )
    
    return options
  }
  
  @Post('register/finish')
  @UseGuards(JwtAuthGuard)
  async finishRegistration(
    @Req() req: AuthenticatedRequest,
    @Body() credential: any
  ) {
    const challenge = await this.sessionStore.get(
      `webauthn:challenge:${req.user.userId}`
    )
    
    const verification = await this.webAuthnService.verifyRegistration({
      credential,
      expectedChallenge: challenge,
      expectedOrigin: 'https://kuybi.com',
      expectedRPID: 'kuybi.com'
    })
    
    if (verification.verified) {
      await this.usersRepository.addAuthenticator(
        req.user.userId,
        verification.authenticatorInfo
      )
    }
    
    return { verified: verification.verified }
  }
  
  @Post('authenticate/start')
  async startAuthentication(@Body() dto: { email: string }) {
    const user = await this.usersRepository.findByEmail(dto.email)
    const authenticators = await this.usersRepository.getAuthenticators(user.id)
    
    const options = await this.webAuthnService.generateAuthenticationOptions({
      allowCredentials: authenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key'
      }))
    })
    
    return options
  }
  
  @Post('authenticate/finish')
  async finishAuthentication(@Body() body: any) {
    // Verify and create session
  }
}
```

**Benefits:**
- ✅ No passwords to remember
- ✅ Phishing-resistant
- ✅ Better UX on mobile
- ✅ Hardware security key support

---

### 9. AI-Powered Anomaly Detection

**Priority**: Low  
**Estimated Effort**: 20-40 hours  
**Dependencies**: ML library (TensorFlow.js), Training data

#### Description
Use machine learning to detect account takeovers and suspicious behavior patterns based on historical data.

#### Technical Implementation

```typescript
class AnomalyDetectionService {
  private model: tf.LayersModel
  
  async analyzePasswordChangeRisk(
    user: User,
    context: ChangeContext
  ): Promise<RiskAnalysis> {
    // Extract features
    const features = await this.extractFeatures(user, context)
    
    // Predict risk using ML model
    const riskScore = await this.predict(features)
    
    // Take action based on risk
    if (riskScore > 0.9) {
      await this.handleHighRisk(user, context, riskScore)
    } else if (riskScore > 0.7) {
      await this.handleMediumRisk(user, context, riskScore)
    }
    
    return {
      riskScore,
      features,
      action: this.determineAction(riskScore),
      confidence: await this.calculateConfidence(features)
    }
  }
  
  private async extractFeatures(
    user: User,
    context: ChangeContext
  ): Promise<number[]> {
    const sessions = await this.sessionsRepository.findRecentByUser(user.id, 90)
    
    return [
      // Temporal features
      this.getTimeSinceLastChange(user),
      this.getHourOfDay(context.timestamp),
      this.getDayOfWeek(context.timestamp),
      
      // Location features
      await this.getGeolocationDistance(user, context),
      this.isNewCountry(user, context) ? 1 : 0,
      this.isNewCity(user, context) ? 1 : 0,
      
      // Device features
      this.isNewDevice(context, sessions) ? 1 : 0,
      this.getDeviceTypeSimilarity(context, sessions),
      
      // Behavioral features
      this.getPasswordChangeFrequency(user),
      this.getSessionPatternSimilarity(context, sessions),
      this.getTypicalLoginHours(sessions).includes(context.timestamp.getHours()) ? 1 : 0,
      
      // Account features
      user.accountAgeDays,
      user.totalLogins,
      user.failedLoginAttempts,
      user.mfaEnabled ? 1 : 0
    ]
  }
  
  private async predict(features: number[]): Promise<number> {
    const tensor = tf.tensor2d([features])
    const prediction = this.model.predict(tensor) as tf.Tensor
    const riskScore = await prediction.data()
    
    tensor.dispose()
    prediction.dispose()
    
    return riskScore[0]
  }
  
  private async handleHighRisk(
    user: User,
    context: ChangeContext,
    riskScore: number
  ): Promise<void> {
    // Temporarily lock account
    await this.securityService.lockAccount(user.id, {
      reason: 'High-risk password change detected',
      riskScore,
      requiresManualReview: true,
      lockedUntil: addHours(new Date(), 24)
    })
    
    // Send urgent security alert
    await this.notificationService.sendUrgentSecurityAlert(user, {
      type: 'account_locked',
      reason: 'suspicious_password_change',
      riskScore,
      context
    })
    
    // Log to security team
    await this.securityLogService.logHighRiskEvent({
      userId: user.id,
      event: 'high_risk_password_change',
      riskScore,
      context
    })
  }
}
```

**Training the Model:**
```typescript
class ModelTrainingService {
  async trainAnomalyDetectionModel(): Promise<void> {
    // Collect historical data
    const trainingData = await this.collectTrainingData()
    
    // Build model
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 64, activation: 'relu', inputShape: [15] }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    })
    
    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    })
    
    // Train
    await model.fit(trainingData.features, trainingData.labels, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2
    })
    
    // Save model
    await model.save('file://./models/anomaly-detection')
  }
}
```

---

## 📝 Implementation Priority

Based on business value and implementation complexity:

### Phase 1 (Immediate - Next Sprint)
- ✅ Password Change History Dashboard (Already in current sprint)
- ✅ Temporary Password Lockout (Already in current sprint)
- ✅ Breach Detection Integration (Already in current sprint)

### Phase 2 (High Priority - Within 2-3 months)
1. Password Expiry & Rotation Policies
2. Multi-Factor Authentication (MFA)
3. Suspicious Activity Alerts

### Phase 3 (Medium Priority - Within 6 months)
4. Password Complexity Tiers
5. Multi-Channel Notifications
6. Password Policy Compliance Dashboard

### Phase 4 (Nice to Have - 6-12 months)
7. Passwordless Authentication (Magic Links + WebAuthn)
8. Password Strength Meter (Real-time WebSocket)

### Phase 5 (Future/Research - 12+ months)
9. AI-Powered Anomaly Detection

---

## 🔧 Technical Considerations

### Dependencies to Install
```bash
# Phase 2
npm install @nestjs/passport passport-totp qrcode speakeasy
npm install twilio firebase-admin

# Phase 4
npm install @simplewebauthn/server @simplewebauthn/browser

# Phase 5
npm install @tensorflow/tfjs-node
```

### Environment Variables to Add
```env
# MFA
ENABLE_MFA=false
MFA_ISSUER=Kuybi
MFA_REQUIRED_FOR_ADMINS=true

# Password Expiry
ENABLE_PASSWORD_EXPIRY=false
PASSWORD_EXPIRY_DAYS=90
PASSWORD_EXPIRY_WARNING_DAYS=7

# SMS
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Anomaly Detection
ENABLE_ANOMALY_DETECTION=false
ML_MODEL_PATH=./models/anomaly-detection
```

### Database Migrations Needed
- User entity extensions (MFA fields, expiry fields)
- Authenticators table (WebAuthn)
- Security events table (Anomaly detection logs)
- Notification preferences table

---

## 📚 References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetsimple.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
- [WebAuthn Guide](https://webauthn.guide/)
- [HaveIBeenPwned API](https://haveibeenpwned.com/API/v3)
- [TOTP RFC 6238](https://tools.ietf.org/html/rfc6238)

---

## 📞 Contact

For questions about these features or to propose new ones, contact the security team or create an issue in the repository.

**Last Updated**: November 6, 2025  
**Maintained By**: Security & Authentication Team
