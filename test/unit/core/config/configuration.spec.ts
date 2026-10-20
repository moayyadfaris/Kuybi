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
