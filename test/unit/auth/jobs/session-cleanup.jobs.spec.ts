import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { SessionCleanupProcessor } from '@modules/auth/jobs/session-cleanup.processor'
import { SessionCleanupScheduler } from '@modules/auth/jobs/session-cleanup.scheduler'
import { SessionRepository } from '@modules/auth/repositories/session.repository'
import { PasswordResetService } from '@modules/auth/services/password-reset.service'
import { SessionsService } from '@modules/auth/services/sessions.service'

import { SessionCleanupJobType } from '@core/queues/jobs/types'

describe('auth cleanup jobs', () => {
  it('schedules the expired password-reset token cleanup daily', async () => {
    const queue = { upsertJobScheduler: jest.fn() }
    await new SessionCleanupScheduler(queue as unknown as Queue).onModuleInit()

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'password-reset-cleanup-daily',
      { pattern: expect.any(String) },
      { name: SessionCleanupJobType.CLEANUP_RESET_TOKENS, data: {} }
    )
  })

  it('deletes reset tokens that expired more than a day ago', async () => {
    const passwordReset = { cleanupExpiredTokens: jest.fn().mockResolvedValue(4) }
    const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() }
    const processor = new SessionCleanupProcessor(
      {} as SessionsService,
      {} as SessionRepository,
      passwordReset as unknown as PasswordResetService,
      logger as unknown as PinoLogger,
      {} as Queue
    )

    const result = await processor.process({
      id: '1',
      name: SessionCleanupJobType.CLEANUP_RESET_TOKENS,
      data: {}
    } as Job)

    expect(passwordReset.cleanupExpiredTokens).toHaveBeenCalledWith(1)
    expect(result).toEqual({ deleted: 4 })
  })
})
