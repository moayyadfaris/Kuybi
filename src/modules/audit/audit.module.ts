import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AclModule } from '@modules/acl'

import { CacheConfigModule } from '@core/cache/cache.module'

import { AuditController } from './controllers/audit.controller'
import { AuditLogRepository } from './database/audit-log.repository'
import { AuditLog } from './entities/audit-log.entity'
import { AclAuditListener } from './listeners/acl-audit.listener'
import { AuditService } from './services/audit.service'
import { AuditContextFactory } from './services/audit-context.factory'
import { AuditQueryService } from './services/audit-query.service'

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), CacheConfigModule, AclModule],
  controllers: [AuditController],
  providers: [
    AuditContextFactory,
    AuditLogRepository,
    AuditService,
    AuditQueryService,
    AclAuditListener
  ],
  exports: [AuditService, AuditQueryService, AuditLogRepository]
})
export class AuditModule {}
