import { PinoLogger } from 'nestjs-pino'

import { EmailJobType } from '@core/queues/jobs/email-jobs'
import { EmailProcessor } from '@core/queues/processors/email.processor'

describe('EmailProcessor account emails', () => {
  const emailService = {
    sendAccountLockedEmail: jest.fn(),
    sendAccountUnlockedEmail: jest.fn(),
    sendPasswordChangedEmail: jest.fn()
  }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  const processor = new EmailProcessor(
    emailService as never,
    logger as unknown as PinoLogger,
    { add: jest.fn() } as never
  )
  // Job data has been through JSON: dates arrive as strings
  const job = (name: EmailJobType, data: object) =>
    ({ id: '1', name, data, attemptsMade: 0, opts: {} }) as never

  beforeEach(() => jest.clearAllMocks())

  it('sends the lockout email with real Date values', async () => {
    await processor.process(
      job(EmailJobType.SEND_ACCOUNT_LOCKED, {
        to: 'a@example.com',
        userName: 'Ann',
        lockedAt: '2026-10-18T10:00:00.000Z',
        lockedUntil: '2026-10-18T10:30:00.000Z',
        failedAttempts: 5
      })
    )

    expect(emailService.sendAccountLockedEmail).toHaveBeenCalledWith(
      'a@example.com',
      'Ann',
      new Date('2026-10-18T10:00:00.000Z'),
      new Date('2026-10-18T10:30:00.000Z'),
      5
    )
  })

  it('sends the unlock email', async () => {
    await processor.process(
      job(EmailJobType.SEND_ACCOUNT_UNLOCKED, {
        to: 'a@example.com',
        userName: 'Ann',
        unlockedAt: '2026-10-18T10:30:00.000Z',
        unlockType: 'automatic',
        previousAttempts: 5
      })
    )

    expect(emailService.sendAccountUnlockedEmail).toHaveBeenCalledWith(
      'a@example.com',
      'Ann',
      new Date('2026-10-18T10:30:00.000Z'),
      'automatic',
      5
    )
  })

  it('turns the password-changed time back into a Date', async () => {
    await processor.process(
      job(EmailJobType.SEND_PASSWORD_CHANGED, {
        to: 'a@example.com',
        userName: 'Ann',
        changeTime: '2026-10-18T09:00:00.000Z'
      })
    )

    expect(emailService.sendPasswordChangedEmail.mock.calls[0][2]).toEqual(
      new Date('2026-10-18T09:00:00.000Z')
    )
  })
})
