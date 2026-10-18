import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { IdempotencyInterceptor } from './idempotency.interceptor'
import { IdempotencyService } from './idempotency.service'
import { IdempotencyKey } from './idempotency-key.entity'

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey])],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor]
})
export class IdempotencyModule {}
