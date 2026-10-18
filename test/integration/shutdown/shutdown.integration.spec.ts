/**
 * Graceful shutdown must not pause queues. queue.pause() is global and persisted in
 * Redis: a single API or worker restart used to leave the email, attachment, account
 * security and cleanup queues paused for every worker, so background jobs stopped.
 */
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ENTITIES } from '@app/database/entities'
import { Queue } from 'bullmq'
import { LoggerModule } from 'nestjs-pino'

import { QueueName } from '@core/queues/jobs/types'
import { ShutdownModule } from '@core/shutdown/shutdown.module'

import { testConfig } from '../../test.config'

const connection = {
  host: testConfig.redis.host,
  port: testConfig.redis.port,
  db: testConfig.redis.db
}
// Own prefix: never touches real queues in the (shared) Redis
const prefix = `kuybi-shutdown-test-${process.pid}`

describe('Graceful shutdown', () => {
  it('leaves queues running for the other processes', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => testConfig] }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities: ENTITIES
        }),
        BullModule.forRoot({ connection, prefix }),
        BullModule.registerQueue({ name: QueueName.EMAIL }),
        ShutdownModule
      ]
    }).compile()
    const app = moduleRef.createNestApplication()
    await app.init()

    await app.close() // what SIGTERM on deploy triggers

    const queue = new Queue(QueueName.EMAIL, { connection, prefix })
    expect(await queue.isPaused()).toBe(false)
    await queue.obliterate({ force: true })
    await queue.close()
  })
})
