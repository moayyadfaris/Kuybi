import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import type { QueueName } from '../queues/jobs/types'

import { OutboxJobOptions, OutboxMessage } from './outbox-message.entity'

export interface OutboxJob<T extends object = Record<string, unknown>> {
  queue: QueueName
  /** BullMQ job name */
  name: string
  data: T
  options?: OutboxJobOptions
  /** Dispatch no earlier than this many milliseconds from now */
  delayMs?: number
}

/**
 * Records background jobs durably instead of adding them to Redis directly.
 *
 * Pass the EntityManager of the transaction that makes the change: the job then exists
 * if and only if that transaction commits. Without one the message is committed on its
 * own, which still survives a Redis outage. Delivery is at-least-once.
 */
@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxMessage)
    private readonly repository: Repository<OutboxMessage>
  ) {}

  async enqueue<T extends object>(job: OutboxJob<T>, manager?: EntityManager): Promise<string> {
    const repository = manager ? manager.getRepository(OutboxMessage) : this.repository
    const message = repository.create({
      queue: job.queue,
      jobName: job.name,
      payload: job.data as Record<string, unknown>,
      jobOptions: job.options ?? {},
      availableAt: new Date(Date.now() + (job.delayMs ?? 0))
    })
    return (await repository.save(message)).id
  }
}
