import { getQueueToken } from '@nestjs/bullmq'
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { errorMessage } from '@shared/utils/error.util'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource, LessThan } from 'typeorm'

import { OutboxMessage } from './outbox-message.entity'

const POLL_INTERVAL_MS = 1000
const BATCH_SIZE = 50
/** After this many failed dispatches a message is parked as 'failed' for inspection */
const MAX_DISPATCH_ATTEMPTS = 10
const PRUNE_INTERVAL_MS = 60 * 60 * 1000
const KEEP_DISPATCHED_DAYS = 7

/** 2s, 4s, 8s ... capped at 5 minutes */
export function dispatchBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 5 * 60 * 1000)
}

/**
 * Moves pending outbox messages into BullMQ (worker process only).
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so several workers can relay in
 * parallel without handing out the same message. The message id is the BullMQ jobId:
 * if a worker dies after queueing but before marking the row, the retry is a no-op
 * while the job is still in Redis.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout
  private running = false
  private lastPrune = 0
  private readonly queues = new Map<string, Queue>()

  constructor(
    private readonly dataSource: DataSource,
    private readonly moduleRef: ModuleRef,
    @InjectPinoLogger(OutboxRelay.name)
    private readonly logger: PinoLogger
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS)
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while ((await this.relayBatch()) === BATCH_SIZE) {
        // keep draining while there is a backlog
      }
      if (Date.now() - this.lastPrune > PRUNE_INTERVAL_MS) {
        await this.prune()
        this.lastPrune = Date.now()
      }
    } catch (error) {
      this.logger.error({ error: errorMessage(error) }, 'Outbox relay cycle failed')
    } finally {
      this.running = false
    }
  }

  /** Dispatches one batch of due messages; returns how many were claimed */
  async relayBatch(): Promise<number> {
    return this.dataSource.transaction(async manager => {
      const messages = await manager
        .getRepository(OutboxMessage)
        .createQueryBuilder('message')
        .where('message.status = :status', { status: 'pending' })
        .andWhere('message.availableAt <= now()')
        .orderBy('message.availableAt', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany()

      for (const message of messages) {
        await this.dispatch(message)
      }
      if (messages.length > 0) {
        await manager.save(messages)
      }
      return messages.length
    })
  }

  private async dispatch(message: OutboxMessage): Promise<void> {
    try {
      await this.queueFor(message.queue).add(message.jobName, message.payload, {
        ...message.jobOptions,
        jobId: message.id
      })
      message.status = 'dispatched'
      message.dispatchedAt = new Date()
      message.lastError = null
    } catch (error) {
      message.attempts += 1
      message.lastError = errorMessage(error)
      if (message.attempts >= MAX_DISPATCH_ATTEMPTS) {
        message.status = 'failed'
        this.logger.error(
          {
            messageId: message.id,
            queue: message.queue,
            job: message.jobName,
            error: message.lastError
          },
          'Outbox message could not be dispatched; parked as failed'
        )
      } else {
        message.availableAt = new Date(Date.now() + dispatchBackoffMs(message.attempts))
        this.logger.warn(
          { messageId: message.id, attempts: message.attempts, error: message.lastError },
          'Outbox dispatch failed; will retry'
        )
      }
    }
  }

  private queueFor(name: string): Queue {
    let queue = this.queues.get(name)
    if (!queue) {
      queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false })
      this.queues.set(name, queue)
    }
    return queue
  }

  /** Deletes dispatched messages older than KEEP_DISPATCHED_DAYS */
  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - KEEP_DISPATCHED_DAYS * 24 * 60 * 60 * 1000)
    const result = await this.dataSource
      .getRepository(OutboxMessage)
      .delete({ status: 'dispatched', dispatchedAt: LessThan(cutoff) })
    return result.affected ?? 0
  }
}
