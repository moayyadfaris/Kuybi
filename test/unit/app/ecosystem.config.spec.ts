/**
 * PM2 process definitions: `pm2 start ecosystem.config.js --env production` must run every
 * process in production mode (production config checks, no test endpoints), never
 * supply a placeholder dashboard password, and give the processes time to shut down.
 */
interface PmApp {
  name: string
  env?: Record<string, unknown>
  env_production?: Record<string, unknown>
  env_staging?: Record<string, unknown>
  kill_timeout?: number
  wait_ready?: boolean
}

// The .env file must not supply values here: the test checks the config's own fallbacks
jest.mock('dotenv', () => ({ config: () => ({}) }))

describe('ecosystem.config.js', () => {
  const load = (): PmApp[] => {
    let apps: PmApp[] = []
    jest.isolateModules(() => {
      apps = (jest.requireActual('../../../ecosystem.config.js') as { apps: PmApp[] }).apps
    })
    return apps
  }
  const saved = process.env.BULL_BOARD_PASSWORD
  afterEach(() => {
    if (saved === undefined) delete process.env.BULL_BOARD_PASSWORD
    else process.env.BULL_BOARD_PASSWORD = saved
  })

  it.each(['production', 'staging'] as const)('runs every process with NODE_ENV=%s', env => {
    for (const app of load()) {
      expect({ app: app.name, env: app[`env_${env}`]?.NODE_ENV }).toEqual({ app: app.name, env })
    }
  })

  it('never falls back to a dashboard password', () => {
    delete process.env.BULL_BOARD_PASSWORD
    const dashboard = load().find(app => app.name === 'kuybi-dashboard')!
    expect(dashboard.env?.BULL_BOARD_PASSWORD).toBeUndefined()
  })

  it('waits longer than the 30 s graceful shutdown before killing the API or the worker', () => {
    for (const app of load().filter(app => app.name !== 'kuybi-dashboard')) {
      expect({ app: app.name, killTimeout: app.kill_timeout }).toEqual({
        app: app.name,
        killTimeout: expect.any(Number)
      })
      expect(app.kill_timeout).toBeGreaterThan(30000)
    }
  })
})
