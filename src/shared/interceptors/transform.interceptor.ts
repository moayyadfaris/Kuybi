import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

import { isBinaryResponse } from './binary-response'

/**
 * Wraps JSON responses in `{ success: true, data }`.
 *
 * Binary responses (StreamableFile, Buffer) and Prometheus metrics are passed through:
 * wrapping them would serialize the stream object to JSON instead of sending the file.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()
    if (request.url?.includes('/metrics')) {
      return next.handle()
    }

    return next
      .handle()
      .pipe(map(data => (isBinaryResponse(data) ? data : { success: true, data })))
  }
}
