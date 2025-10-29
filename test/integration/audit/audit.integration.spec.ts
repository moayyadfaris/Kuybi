import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, CanActivate } from '@nestjs/common'
import * as request from 'supertest'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'crypto'
import { AuditController } from '@modules/audit/controllers/audit.controller'
import { AuditQueryService } from '@modules/audit/services/audit-query.service'
import { AuditLogRepository, AuditLogFilters } from '@modules/audit/database/audit-log.repository'
import {
  AuditLog,
  AuditAction,
  AuditStatus,
  AuditSeverity
} from '@modules/audit/entities/audit-log.entity'
import { PinoLogger } from 'nestjs-pino'
import { TransformInterceptor } from '@shared/interceptors/transform.interceptor'
import { RequestIdInterceptor } from '@shared/interceptors/request-id.interceptor'
import { RequestIdMiddleware } from '@core/http/middleware/request-id.middleware'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'

class AllowGuard implements CanActivate {
  canActivate(): boolean {
    return true
  }
}

describe('Audit Integration (controller)', () => {
  let app: INestApplication
  const createLog = (override: Partial<AuditLog>): AuditLog => {
    const createdAt = override.createdAt ?? new Date()
    const base: any = {
      id: override.id ?? randomUUID(),
      action: override.action ?? AuditAction.LOGIN,
      status: override.status ?? AuditStatus.SUCCESS,
      severity: override.severity ?? AuditSeverity.LOW,
      userId: override.userId ?? null,
      username: override.username ?? null,
      email: override.email ?? null,
      entityType: override.entityType ?? null,
      entityId: override.entityId ?? null,
      previousValues: override.previousValues ?? null,
      newValues: override.newValues ?? null,
      changes: override.changes ?? null,
      ipAddress: override.ipAddress ?? '127.0.0.1',
      userAgent: override.userAgent ?? 'test-agent',
      method: override.method ?? 'POST',
      endpoint: override.endpoint ?? '/api/v1/auth/login',
      requestId: override.requestId ?? 'req-1',
      statusCode: override.statusCode ?? 200,
      errorMessage: override.errorMessage ?? null,
      errorStack: override.errorStack ?? null,
      tags: override.tags ?? ['test'],
      metadata: override.metadata ?? {},
      description: override.description ?? 'Test log',
      retentionDays: override.retentionDays ?? 0,
      isArchived: override.isArchived ?? false,
      archivedAt: override.archivedAt ?? null,
      createdAt
    }

    Object.defineProperties(base, {
      isError: {
        get: () => base.status === AuditStatus.FAILURE
      },
      isCritical: {
        get: () => base.severity === AuditSeverity.CRITICAL || base.severity === AuditSeverity.HIGH
      },
      shouldRetain: {
        get: () => {
          if (base.retentionDays === 0) return true
          const retentionDate = new Date(createdAt)
          retentionDate.setDate(retentionDate.getDate() + base.retentionDays)
          return retentionDate > new Date()
        }
      }
    })

    return base as AuditLog
  }

  const auditLogs: AuditLog[] = [
    createLog({
      id: '1',
      action: AuditAction.LOGIN,
      endpoint: '/api/v1/auth/login',
      description: 'User logged in'
    }),
    createLog({
      id: '2',
      action: AuditAction.LOGOUT,
      endpoint: '/api/v1/auth/logout',
      description: 'User logged out'
    })
  ]

  const repositoryStub: Partial<AuditLogRepository> = {
    search: jest.fn(
      async (_filters: AuditLogFilters, _pagination: { skip?: number; take?: number }) =>
        [auditLogs, auditLogs.length] as [AuditLog[], number]
    )
  }

  const loggerStub: Partial<PinoLogger> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: { level: 'silent' }
        })
      ],
      controllers: [AuditController],
      providers: [
        AuditQueryService,
        { provide: AuditLogRepository, useValue: repositoryStub },
        { provide: PinoLogger, useValue: loggerStub }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(AbilityGuard)
      .useClass(AllowGuard)
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    const requestIdMiddleware = new RequestIdMiddleware()
    app.use((req, res, next) => requestIdMiddleware.use(req as any, res, next))
    app.useGlobalInterceptors(new RequestIdInterceptor(), new TransformInterceptor())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/audit/search returns audit logs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audit/search?limit=5')
      .set('Authorization', 'Bearer test-token')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.requestId).toBeDefined()
    expect(response.body.data.logs).toHaveLength(2)
    expect(response.body.data.total).toBe(2)
    expect(repositoryStub.search).toHaveBeenCalled()
  })
})
