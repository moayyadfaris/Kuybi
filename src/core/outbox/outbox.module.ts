import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { QueuesModule } from '../queues/queues.module'

import { OutboxService } from './outbox.service'
import { OutboxMessage } from './outbox-message.entity'
import { OutboxMetrics } from './outbox-metrics'
import { OutboxRelay } from './outbox-relay.service'

/** Writing outbox messages; import wherever jobs are produced */
@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage])],
  providers: [OutboxService, OutboxMetrics],
  exports: [OutboxService]
})
export class OutboxModule {}

/** Relaying them to BullMQ; imported by the worker only */
@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage]), QueuesModule],
  providers: [OutboxRelay],
  exports: [OutboxRelay]
})
export class OutboxRelayModule {}
