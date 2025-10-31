import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditLog } from './entities/audit-log.entity'
import { AuditLogRepository } from './database/audit-log.repository'
import { AuditService } from './services/audit.service'
import { AuditContextFactory } from './services/audit-context.factory'
import { AuditQueryService } from './services/audit-query.service'
import { AuditController } from './controllers/audit.controller'
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor'
import { CacheConfigModule } from '@core/cache/cache.module'
import { SentryModule } from '@core/sentry'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    CacheConfigModule,
    SentryModule.forRoot(),
    AclModule
  ],
  controllers: [AuditController],
  providers: [
    AuditContextFactory,
    AuditLogRepository,
    AuditService,
    AuditQueryService,
    AuditLogInterceptor
  ],
  exports: [AuditService, AuditQueryService, AuditLogInterceptor]
})
export class AuditModule {}
