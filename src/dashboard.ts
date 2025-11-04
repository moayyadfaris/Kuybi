import { ExpressAdapter } from '@bull-board/express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { Queue } from 'bullmq'
import * as express from 'express'
import * as basicAuth from 'express-basic-auth'
import { QueueName } from '@core/queues/jobs/types'

/**
 * Bull Board Dashboard
 *
 * Web-based monitoring UI for all Bull queues
 *
 * Features:
 * - Real-time job monitoring
 * - Job retry/remove capabilities
 * - Queue statistics and metrics
 * - Failed job inspection
 * - Job search and filtering
 *
 * Security:
 * - Protected with HTTP Basic Auth
 * - Credentials from environment variables
 */

async function bootstrap() {
  // Load environment variables directly
  const redisHost = process.env.REDIS_HOST || 'localhost'
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10)
  const redisPassword = process.env.REDIS_PASSWORD
  const redisQueueDb = parseInt(process.env.REDIS_QUEUE_DB || '1', 10)
  const dashboardPort = parseInt(process.env.BULL_BOARD_PORT || '4050', 10)
  const username = process.env.BULL_BOARD_USERNAME || 'admin'
  const password = process.env.BULL_BOARD_PASSWORD || 'admin123'

  // Create Redis connection for queues
  const connection = {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    db: redisQueueDb
  }

  console.log('📊 Initializing Bull Board Dashboard...')
  console.log(`   Redis: ${connection.host}:${connection.port} (DB ${connection.db})`)

  // Create queue instances for monitoring
  const queues = [
    new Queue(QueueName.SESSION_CLEANUP, { connection }),
    new Queue(QueueName.LOG_MAINTENANCE, { connection }),
    new Queue(QueueName.EMAIL, { connection }),
    new Queue(QueueName.SMS, { connection }),
    new Queue(QueueName.ATTACHMENT_PROCESSING, { connection }),
    new Queue(QueueName.NOTIFICATION, { connection }),
    new Queue(QueueName.SECURITY_SCAN, { connection }),
    new Queue(QueueName.DATA_EXPORT, { connection }),
    new Queue(QueueName.REPORT_GENERATION, { connection }),
    new Queue(QueueName.VERSION_CLEANUP, { connection }),
    new Queue(QueueName.ACCOUNT_SECURITY, { connection })
  ]

  // Create Bull Board
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/admin/queues')

  createBullBoard({
    queues: queues.map(queue => new BullMQAdapter(queue)),
    serverAdapter
  })

  // Create Express app for dashboard
  const dashboardApp = express()

  // Add basic auth protection
  dashboardApp.use(
    '/admin/queues',
    basicAuth({
      users: { [username]: password },
      challenge: true,
      realm: 'Bull Board Dashboard'
    })
  )

  dashboardApp.use('/admin/queues', serverAdapter.getRouter())

  // Health check endpoint
  dashboardApp.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'bull-board',
      timestamp: new Date().toISOString(),
      redis: {
        host: connection.host,
        port: connection.port,
        db: connection.db
      },
      queues: queues.map(q => q.name)
    })
  })

  // Root redirect
  dashboardApp.get('/', (req, res) => {
    res.redirect('/admin/queues')
  })

  dashboardApp.listen(dashboardPort, () => {
    console.log('✅ Bull Board Dashboard is running!')
    console.log(`   URL: http://localhost:${dashboardPort}/admin/queues`)
    console.log(`   Username: ${username}`)
    console.log(`   Password: ${password}`)
    console.log(`   Health: http://localhost:${dashboardPort}/health`)
    console.log('')
    console.log('📈 Monitoring queues:')
    queues.forEach(queue => console.log(`   - ${queue.name}`))
  })
}

bootstrap().catch(err => {
  console.error('Failed to start Bull Board:', err)
  process.exit(1)
})
