import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp()
    const request = httpContext.getRequest<Request & { id?: string; requestId?: string }>()
    const requestId = request?.id || (request as any)?.requestId

    if (!requestId) {
      return next.handle()
    }

    return next.handle().pipe(
      map(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          if ('requestId' in data) {
            return data
          }
          return { ...data, requestId }
        }
        return data
      })
    )
  }
}
