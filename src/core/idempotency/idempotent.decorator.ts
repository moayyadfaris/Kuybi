import { applyDecorators, UseInterceptors } from '@nestjs/common'
import { ApiHeader } from '@nestjs/swagger'

import { IdempotencyInterceptor } from './idempotency.interceptor'

/**
 * Accept an Idempotency-Key header on this route (see IdempotencyInterceptor). The
 * module that declares the controller must import IdempotencyModule.
 */
export function Idempotent(): MethodDecorator {
  return applyDecorators(
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'Unique key (e.g. a UUID) for safely retrying this request; retries with the same key and body return the original result'
    })
  )
}
