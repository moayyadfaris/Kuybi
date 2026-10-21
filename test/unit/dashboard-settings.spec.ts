import { dashboardHealth, dashboardSettings, startupLines } from '@app/dashboard-settings'

describe('Bull Board dashboard settings', () => {
  const env = { BULL_BOARD_PASSWORD: 'a-long-dashboard-password', NODE_ENV: 'production' }

  it('listens on loopback unless told otherwise (reach it through a tunnel or proxy)', () => {
    expect(dashboardSettings(env).host).toBe('127.0.0.1')
    expect(dashboardSettings({ ...env, BULL_BOARD_HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })

  it('refuses to start without a password', () => {
    expect(() => dashboardSettings({ NODE_ENV: 'development' })).toThrow(/BULL_BOARD_PASSWORD/)
  })

  it('never prints the password (stdout ends up in log files)', () => {
    const lines = startupLines(dashboardSettings(env), ['email']).join('\n')
    expect(lines).not.toContain('a-long-dashboard-password')
    expect(lines).toContain('admin')
  })

  it('answers health checks without describing the Redis behind it', () => {
    const body = JSON.stringify(dashboardHealth())
    expect(body).toContain('healthy')
    expect(body).not.toMatch(/redis|host|port|6379/i)
  })
})
