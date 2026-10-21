import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { Queue } from 'bullmq'
import express from 'express'
import basicAuth from 'express-basic-auth'

import { QueueName } from '@core/queues/jobs/types'

import { dashboardHealth, dashboardSettings, startupLines } from './dashboard-settings'

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
 * Security (see dashboardSettings):
 * - HTTP Basic Auth; BULL_BOARD_PASSWORD is required and never printed
 * - Listens on loopback unless BULL_BOARD_HOST says otherwise: Basic Auth over plain
 *   HTTP must not face a network, so reach it through an SSH tunnel or a TLS proxy
 */

async function bootstrap() {
  const settings = dashboardSettings()
  const connection = settings.redis

  // Create queue instances for monitoring
  const queues = [
    new Queue(QueueName.SESSION_CLEANUP, { connection }),
    new Queue(QueueName.EMAIL, { connection }),
    new Queue(QueueName.ATTACHMENT_PROCESSING, { connection }),
    new Queue(QueueName.VERSION_CLEANUP, { connection }),
    new Queue(QueueName.CONTENT_PUBLISHING, { connection }),
    new Queue(QueueName.AUDIT_RETENTION, { connection }),
    new Queue(QueueName.ACCOUNT_SECURITY, { connection }),
    new Queue(QueueName.DEAD_LETTER, { connection })
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
      users: { [settings.username]: settings.password },
      challenge: true,
      realm: 'Bull Board Dashboard'
    })
  )

  dashboardApp.use('/admin/queues', serverAdapter.getRouter())

  // Health check endpoint (unauthenticated: says nothing about the infrastructure)
  dashboardApp.get('/health', (_req, res) => {
    res.json(dashboardHealth())
  })

  // Root redirect
  dashboardApp.get('/', (req, res) => {
    res.redirect('/admin/queues')
  })

  dashboardApp.listen(settings.port, settings.host, () => {
    startupLines(
      settings,
      queues.map(queue => queue.name)
    ).forEach(line => console.log(line))
  })
}

bootstrap().catch(err => {
  console.error('Failed to start Bull Board:', err)
  process.exit(1)
})
