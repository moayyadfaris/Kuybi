import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule } from '@nestjs/config'

// Entities
import { AlertRule } from './entities/alert-rule.entity'
import { Alert } from './entities/alert.entity'
import { AlertEscalation } from './entities/alert-escalation.entity'
import { AlertNotification } from './entities/alert-notification.entity'

// Services
import { AlertRulesService } from './services/alert-rules.service'
import { AlertManagerService } from './services/alert-manager.service'
import { SecurityEventProcessorService } from './services/security-event-processor.service'

// Controllers
// import { SecurityController } from './controllers/security.controller'
// import { AlertRulesController } from './controllers/alert-rules.controller'

// Modules
import { AuditModule } from '../audit/audit.module'
import { EmailModule } from '@infrastructure/email/email.module'
import { CacheConfigModule } from '@core/cache/cache.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, Alert, AlertEscalation, AlertNotification]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ConfigModule,
    AuditModule,
    EmailModule,
    CacheConfigModule
  ],
  controllers: [],
  providers: [
    AlertRulesService,
    AlertManagerService,
    SecurityEventProcessorService
  ],
  exports: [AlertRulesService, AlertManagerService]
})
export class SecurityModule {}