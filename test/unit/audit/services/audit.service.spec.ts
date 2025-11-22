import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'

import { AuditLogRepository } from '@modules/audit/database/audit-log.repository'
import {
  AuditAction,
  AuditLog,
  AuditSeverity,
  AuditStatus
} from '@modules/audit/entities/audit-log.entity'
import { AuditService } from '@modules/audit/services/audit.service'
import { AuditContextFactory } from '@modules/audit/services/audit-context.factory'
import { ContextUser } from '@modules/audit/types/context-user.interface'

const createRepositoryStub = () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn()
  }

  return {
    repo: repository,
    instance: {
      getRepository: () => repository,
      invalidateAllCaches: jest.fn()
    } as unknown as AuditLogRepository
  }
}

const createConfigStub = (enabled: boolean): ConfigService =>
  ({
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'audit.enabled') {
        return enabled
      }
      return defaultValue
    })
  }) as unknown as ConfigService

const loggerStub: Partial<PinoLogger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}

describe('AuditService', () => {
  const contextFactory = new AuditContextFactory()

  const sampleUser: ContextUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User'
  }

  it('skips logging when disabled', async () => {
    const { instance, repo } = createRepositoryStub()
    const mockSentryService = {} as any
    const service = new AuditService(
      instance,
      contextFactory,
      createConfigStub(false),
      mockSentryService,
      loggerStub as PinoLogger
    )

    const req = {
      headers: {},
      protocol: 'http',
      hostname: 'localhost',
      path: '/api/login',
      query: {},
      method: 'POST',
      originalUrl: '/api/login',
      url: '/api/login',
      socket: { remoteAddress: '10.0.0.1' },
      get: jest.fn()
    } as any

    const result = await service.logLoginFromRequest(req, sampleUser)

    expect(result).toBeNull()
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('persists audit log when enabled', async () => {
    const { instance, repo } = createRepositoryStub()
    const savedLog: Partial<AuditLog> = {
      id: 'log-1',
      action: AuditAction.LOGIN,
      status: AuditStatus.SUCCESS,
      severity: AuditSeverity.LOW,
      requestId: 'req-123'
    }
    repo.create.mockReturnValue(savedLog)
    repo.save.mockResolvedValue(savedLog)

    const mockSentryService = {} as any
    const service = new AuditService(
      instance,
      contextFactory,
      createConfigStub(true),
      mockSentryService,
      loggerStub as PinoLogger
    )

    const req = {
      headers: { 'x-request-id': 'req-123' },
      protocol: 'http',
      hostname: 'localhost',
      path: '/api/login',
      query: {},
      method: 'POST',
      originalUrl: '/api/login',
      url: '/api/login',
      socket: { remoteAddress: '10.0.0.1' },
      get(this: any, header: string) {
        return this.headers[header.toLowerCase()]
      }
    } as any

    const result = await service.logLoginFromRequest(req, sampleUser, { sessionType: 'standard' })

    expect(repo.create).toHaveBeenCalled()
    expect(repo.save).toHaveBeenCalled()
    expect(result).toEqual(savedLog)
  })
})
