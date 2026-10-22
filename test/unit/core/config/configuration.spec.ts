import configuration from '@core/config/configuration'

describe('configuration: app.publicUrl', () => {
  const saved = process.env.APP_PUBLIC_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_PUBLIC_URL
    else process.env.APP_PUBLIC_URL = saved
  })

  it('is APP_PUBLIC_URL without a trailing slash', () => {
    process.env.APP_PUBLIC_URL = 'https://www.kuybi.com/'
    expect(configuration().app.publicUrl).toBe('https://www.kuybi.com')
  })

  it('defaults to the local site for development', () => {
    delete process.env.APP_PUBLIC_URL
    expect(configuration().app.publicUrl).toBe('http://localhost:4040')
  })
})

describe('configuration: auth.sessionDays', () => {
  const saved = process.env.JWT_REFRESH_EXPIRES_IN
  afterEach(() => {
    if (saved === undefined) delete process.env.JWT_REFRESH_EXPIRES_IN
    else process.env.JWT_REFRESH_EXPIRES_IN = saved
  })

  it.each([
    ['30d', 30],
    ['12h', 0.5],
    ['90m', 90 / 1440]
  ])('follows JWT_REFRESH_EXPIRES_IN=%s', (value, days) => {
    process.env.JWT_REFRESH_EXPIRES_IN = value
    expect(configuration().auth.sessionDays).toBeCloseTo(days)
  })

  it('defaults to 7 days', () => {
    delete process.env.JWT_REFRESH_EXPIRES_IN
    expect(configuration().auth.sessionDays).toBe(7)
  })
})

/**
 * Settings the app reads must exist in the configuration: before, these keys were read
 * but never defined, so their environment variables (documented in .env.example) did
 * nothing and the code always used its fallback.
 */
describe('configuration: settings that used to be ignored', () => {
  const keys = [
    'COMPRESSION_ENABLED',
    'COMPRESSION_THRESHOLD',
    'COMPRESSION_LEVEL',
    'SESSION_MAX_PER_USER',
    'EMAIL_SECURITY'
  ]
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('reads compression from COMPRESSION_*', () => {
    process.env.COMPRESSION_ENABLED = 'false'
    process.env.COMPRESSION_THRESHOLD = '2048'
    process.env.COMPRESSION_LEVEL = '4'
    expect(configuration().compression).toEqual({ enabled: false, threshold: 2048, level: 4 })
  })

  it('reads the session limit per user from SESSION_MAX_PER_USER (default 5)', () => {
    delete process.env.SESSION_MAX_PER_USER
    expect(configuration().auth.maxConcurrentSessions).toBe(5)
    process.env.SESSION_MAX_PER_USER = '3'
    expect(configuration().auth.maxConcurrentSessions).toBe(3)
  })

  it('reads the security contact from EMAIL_SECURITY', () => {
    process.env.EMAIL_SECURITY = 'security@kuybi.com'
    expect(configuration().email.securityEmail).toBe('security@kuybi.com')
  })
})
