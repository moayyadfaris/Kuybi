import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { PinoLogger } from 'nestjs-pino'

import { AuthService } from '@modules/auth/services/auth.service'

import { PasswordHasher } from '@core/security'

// Pass-through mock so calls can be counted (bcrypt's exports are not spy-able)
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt')
  return { ...actual, compare: jest.fn(actual.compare) }
})

const EMAIL = 'Someone.Private@example.com'

function setup(
  overrides: { user?: unknown; passwordHash?: string; lockInfo?: object; rounds?: number } = {}
) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const sentry = { captureMessage: jest.fn(), captureException: jest.fn() }
  const metrics = { incrementFailedLogin: jest.fn(), incrementUserLogin: jest.fn() }
  const lockout = {
    isAccountLocked: jest.fn().mockResolvedValue(false),
    recordFailedAttempt: jest.fn(),
    resetFailedAttempts: jest.fn(),
    getAccountLockInfo: jest
      .fn()
      .mockResolvedValue({ isLocked: false, failedAttempts: 1, ...overrides.lockInfo })
  }
  const users = {
    findByEmail: jest.fn().mockResolvedValue(overrides.user ?? null),
    getPasswordHash: jest.fn().mockResolvedValue(overrides.passwordHash ?? null),
    storePasswordHash: jest.fn()
  }

  const service = new AuthService(
    logger as unknown as PinoLogger,
    users as never,
    {} as never, // sessions
    {} as never, // token blacklist
    lockout as never,
    {} as never, // access tokens
    sentry as never,
    metrics as never,
    new PasswordHasher({ get: () => overrides.rounds ?? 4 } as unknown as ConfigService)
  )
  return { service, logger, sentry, metrics, users }
}

describe('AuthService failed logins', () => {
  it('unknown email: 401, bcrypt still runs, nothing sent to Sentry, email only hashed', async () => {
    const compare = jest.mocked(bcrypt.compare)
    compare.mockClear()
    const { service, logger, sentry, metrics } = setup()

    await expect(service.validateUser(EMAIL, 'whatever')).rejects.toBeInstanceOf(
      UnauthorizedException
    )

    expect(compare).toHaveBeenCalledTimes(1) // equalises timing with a wrong password
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(metrics.incrementFailedLogin).toHaveBeenCalledWith('user_not_found')
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain(EMAIL.toLowerCase())
    expect(logged).toMatch(/"emailHash":"[0-9a-f]{16}"/)
  })

  it('wrong password: counted and logged, not sent to Sentry', async () => {
    const { service, sentry, metrics } = setup({
      user: { id: 'u1', email: EMAIL, isActive: true },
      passwordHash: await bcrypt.hash('correct-password', 4)
    })

    await expect(service.validateUser(EMAIL, 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException
    )

    expect(metrics.incrementFailedLogin).toHaveBeenCalledWith('invalid_password')
    expect(sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('the attempt that locks the account alerts Sentry with the user id only', async () => {
    const { service, sentry } = setup({
      user: { id: 'u1', email: EMAIL, isActive: true },
      passwordHash: await bcrypt.hash('correct-password', 4),
      lockInfo: { isLocked: true, failedAttempts: 5, lockedUntil: null }
    })

    await expect(service.validateUser(EMAIL, 'wrong-password')).rejects.toMatchObject({
      status: 423
    })

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain(EMAIL)
  })

  describe('password hash upgrade on login', () => {
    const user = { id: 'u1', email: EMAIL, isActive: true }

    it('re-hashes a password stored below the configured cost', async () => {
      const { service, users } = setup({
        user,
        passwordHash: await bcrypt.hash('correct-password', 4),
        rounds: 5
      })

      await service.validateUser(EMAIL, 'correct-password')

      expect(users.storePasswordHash).toHaveBeenCalledTimes(1)
      const [userId, upgraded] = users.storePasswordHash.mock.calls[0]
      expect(userId).toBe('u1')
      expect(bcrypt.getRounds(upgraded)).toBe(5)
      expect(await bcrypt.compare('correct-password', upgraded)).toBe(true)
    })

    it('leaves a hash at the configured cost alone, and never blocks the login', async () => {
      const current = setup({ user, passwordHash: await bcrypt.hash('correct-password', 4) })
      await current.service.validateUser(EMAIL, 'correct-password')
      expect(current.users.storePasswordHash).not.toHaveBeenCalled()

      const failing = setup({
        user,
        passwordHash: await bcrypt.hash('correct-password', 4),
        rounds: 5
      })
      failing.users.storePasswordHash.mockRejectedValue(new Error('db down'))
      await expect(failing.service.validateUser(EMAIL, 'correct-password')).resolves.toBe(user)
    })
  })
})
