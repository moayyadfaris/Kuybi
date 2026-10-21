import { assertProductionSecrets } from '@core/config/validation'

export interface DashboardSettings {
  host: string
  port: number
  username: string
  password: string
  redis: { host: string; port: number; password?: string; db: number }
}

/**
 * Bull Board settings from the environment. The dashboard can retry, promote and delete
 * jobs and shows their data, so it needs a real password and listens on loopback by
 * default: reach it through an SSH tunnel or an authenticating TLS proxy
 * (BULL_BOARD_HOST=0.0.0.0 only behind one).
 */
export function dashboardSettings(env: NodeJS.ProcessEnv = process.env): DashboardSettings {
  const password = env.BULL_BOARD_PASSWORD
  if (!password) {
    throw new Error('BULL_BOARD_PASSWORD must be set to start the Bull Board dashboard')
  }
  assertProductionSecrets(env, ['BULL_BOARD_PASSWORD'])

  return {
    host: env.BULL_BOARD_HOST || '127.0.0.1',
    port: parseInt(env.BULL_BOARD_PORT || '4050', 10),
    username: env.BULL_BOARD_USERNAME || 'admin',
    password,
    redis: {
      host: env.REDIS_HOST || 'localhost',
      port: parseInt(env.REDIS_PORT || '6379', 10),
      password: env.REDIS_PASSWORD,
      db: parseInt(env.REDIS_QUEUE_DB || '1', 10)
    }
  }
}

/** What the dashboard prints when it starts; never the password (stdout goes to log files) */
export function startupLines(settings: DashboardSettings, queueNames: string[]): string[] {
  return [
    'Bull Board dashboard is running',
    `  URL: http://${settings.host}:${settings.port}/admin/queues`,
    `  Username: ${settings.username}`,
    '  Password: from BULL_BOARD_PASSWORD',
    `  Queues: ${queueNames.join(', ')}`
  ]
}

/** The unauthenticated health answer: alive or not, nothing about the infrastructure */
export function dashboardHealth() {
  return { status: 'healthy', service: 'bull-board', timestamp: new Date().toISOString() }
}
