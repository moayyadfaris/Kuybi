import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { ConfigService } from '@nestjs/config'
import { LoggingContextService } from './logging-context.service'
import { RequestWithContextLogger } from './types/request-with-context-logger.interface'

@Injectable()
export class LoggingContextInterceptor implements NestInterceptor {
  constructor(
    private readonly loggingContext: LoggingContextService,
    private readonly configService: ConfigService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const httpContext = context.switchToHttp()
    const request = httpContext.getRequest<RequestWithContextLogger>()
    const baseLogger =
      request?.log?.child && typeof request.log.child === 'function'
        ? request.log
        : this.loggingContext.getLogger()

    const contextualLogger = baseLogger.child({
      requestId: request?.id,
      userId: request?.user?.id,
      path: request?.originalUrl ?? request?.url,
      method: request?.method,
      service: this.configService.get<string>('app.name', 'susanoo-nest'),
      environment: this.configService.get<string>('app.env', 'development')
    })

    request.contextLogger = contextualLogger

    return this.loggingContext.runWith(contextualLogger, () => next.handle())
  }
}
