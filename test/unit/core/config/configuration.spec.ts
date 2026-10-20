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
