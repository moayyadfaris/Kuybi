import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'node:async_hooks'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import pino from 'pino'

@Injectable()
export class LoggingContextService {
  private readonly storage = new AsyncLocalStorage<pino.Logger>()
  private readonly fallbackLogger: pino.Logger

  constructor(
    @InjectPinoLogger(LoggingContextService.name)
    private readonly rootLogger: PinoLogger,
  ) {
    this.fallbackLogger = this.rootLogger.logger
  }

  runWith<T>(logger: pino.Logger, fn: () => T): T {
    return this.storage.run(logger, fn)
  }

  getLogger(bindings?: Record<string, any>): pino.Logger {
    const currentLogger = this.storage.getStore() ?? this.fallbackLogger
    return bindings ? currentLogger.child(bindings) : currentLogger
  }
}
