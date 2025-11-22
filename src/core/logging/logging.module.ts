import { Global, Module } from '@nestjs/common'

import { LogMaintenanceService } from './log-maintenance.service'
import { LoggingContextService } from './logging-context.service'

@Global()
@Module({
  providers: [LoggingContextService, LogMaintenanceService],
  exports: [LoggingContextService]
})
export class LoggingModule {}
