import { assertProductionSecrets, validate } from '@core/config/validation'

import 'reflect-metadata'

describe('assertProductionSecrets', () => {
  const strongSecret = 'x'.repeat(48)

  const deployed = {
    JWT_SECRET: strongSecret,
    DB_PASSWORD: 'a-real-database-password',
    CORS_ORIGIN: 'https://admin.kuybi.com,https://kuybi.com',
    APP_PUBLIC_URL: 'https://www.kuybi.com'
  }

  it.each(['development', 'test', undefined])('is a no-op for NODE_ENV=%s', env => {
    expect(() => assertProductionSecrets({ NODE_ENV: env })).not.toThrow()
  })

  it('accepts strong production secrets', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', ...deployed })).not.toThrow()
  })

  it('rejects a bcrypt cost below 10 outside development/test', () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', ...deployed, BCRYPT_ROUNDS: 8 })
    ).toThrow(/BCRYPT_ROUNDS must be at least 10/)
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', ...deployed, BCRYPT_ROUNDS: 12 })
    ).not.toThrow()
    expect(() => assertProductionSecrets({ NODE_ENV: 'test', BCRYPT_ROUNDS: 4 })).not.toThrow()
  })

  it('reads BCRYPT_ROUNDS as the environment gives it: a string', () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', ...deployed, BCRYPT_ROUNDS: '4' })
    ).toThrow(/BCRYPT_ROUNDS must be at least 10/)
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', ...deployed, BCRYPT_ROUNDS: '12' })
    ).not.toThrow()
  })

  it.each([undefined, '', 'www.kuybi.com', 'ftp://kuybi.com'])(
    'requires APP_PUBLIC_URL as an http(s) URL outside development/test (%s)',
    url => {
      expect(() =>
        assertProductionSecrets({ NODE_ENV: 'production', ...deployed, APP_PUBLIC_URL: url })
      ).toThrow(/APP_PUBLIC_URL/)
    }
  )

  it('applies to staging too, not only production', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'staging' })).toThrow(
      /Insecure staging configuration[\s\S]*JWT_SECRET is required in staging/
    )
  })

  it.each([undefined, '*', 'https://kuybi.com, *'])(
    'rejects CORS_ORIGIN=%s outside development/test',
    corsOrigin => {
      expect(() =>
        assertProductionSecrets({ NODE_ENV: 'production', ...deployed, CORS_ORIGIN: corsOrigin })
      ).toThrow(/CORS_ORIGIN must list the allowed origins/)
    }
  )

  it('rejects a missing JWT_SECRET in production', () => {
    expect(() =>
      assertProductionSecrets({ ...deployed, NODE_ENV: 'production', JWT_SECRET: undefined })
    ).toThrow(/JWT_SECRET is required/)
  })

  it('rejects placeholder values in production', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-kuybi-secret-key-for-production',
        DB_PASSWORD: 'a-real-database-password'
      })
    ).toThrow(/placeholder/)
  })

  it('rejects a short JWT_SECRET in production', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
        DB_PASSWORD: 'a-real-database-password'
      })
    ).toThrow(/at least 32 characters/)
  })

  it('checks only the keys it is asked to check', () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', BULL_BOARD_PASSWORD: 'admin123' }, [
        'BULL_BOARD_PASSWORD'
      ])
    ).toThrow(/BULL_BOARD_PASSWORD uses a placeholder value/)
  })
})

describe('validate', () => {
  it.each(['7', '7 days', '1w', ''])('rejects JWT_REFRESH_EXPIRES_IN=%s', value => {
    expect(() =>
      validate({ NODE_ENV: 'test', CORS_ORIGIN: '*', JWT_REFRESH_EXPIRES_IN: value })
    ).toThrow(/JWT_REFRESH_EXPIRES_IN/)
  })

  it('rejects an unknown NODE_ENV instead of booting with development defaults', () => {
    expect(() => validate({ NODE_ENV: 'prod', CORS_ORIGIN: '*' })).toThrow(/NODE_ENV/)
  })

  const base = { NODE_ENV: 'test', CORS_ORIGIN: '*' }

  it('reads the database user from DB_USERNAME, the name the app uses', () => {
    expect(() => validate({ ...base, DB_USERNAME: 'kuybi' })).not.toThrow()
    expect(validate({ ...base, DB_USERNAME: 'kuybi' })).toHaveProperty('DB_USERNAME', 'kuybi')
  })

  it.each([
    ['REDIS_PORT', 'abc'],
    ['REDIS_DB', '16'],
    ['REDIS_QUEUE_DB', '-1'],
    ['REDIS_TTL', '0'],
    ['DB_PORT', '70000'],
    ['DB_POOL_MAX', 'ten'],
    ['ACCOUNT_LOCKOUT_MAX_ATTEMPTS', '0'],
    ['ACCOUNT_LOCKOUT_DURATION', '30m'],
    ['STORY_KEEP_AUTO_VERSIONS', '0'],
    ['SENTRY_TRACES_SAMPLE_RATE', '150'],
    ['WORKER_SHUTDOWN_TIMEOUT_MS', 'soon'],
    ['ACCOUNT_LOCKOUT_ENABLED', 'maybe'],
    ['SENTRY_ENABLED', 'ture'],
    ['AUDIT_ENABLED', 'enabled']
  ])('rejects %s=%s at startup', (key, value) => {
    expect(() => validate({ ...base, [key]: value })).toThrow(key)
  })

  it('accepts the documented values', () => {
    expect(() =>
      validate({
        ...base,
        REDIS_PORT: '6379',
        REDIS_DB: '0',
        REDIS_QUEUE_DB: '1',
        ACCOUNT_LOCKOUT_ENABLED: 'true',
        SENTRY_ENABLED: 'false',
        SENTRY_TRACES_SAMPLE_RATE: '10',
        ACCOUNT_LOCKOUT_DURATION: '1800000'
      })
    ).not.toThrow()
  })

  it('accepts the known environments', () => {
    expect(() => validate({ NODE_ENV: 'test', CORS_ORIGIN: '*' })).not.toThrow()
  })
})
