import { Global, Module } from '@nestjs/common'
import { LoggingContextService } from './logging-context.service'
import { LogMaintenanceService } from './log-maintenance.service'

@Global()
@Module({
  providers: [LoggingContextService, LogMaintenanceService],
  exports: [LoggingContextService]
})
export class LoggingModule {}
