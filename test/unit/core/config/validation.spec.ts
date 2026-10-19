import { assertProductionSecrets, validate } from '@core/config/validation'

import 'reflect-metadata'

describe('assertProductionSecrets', () => {
  const strongSecret = 'x'.repeat(48)

  const deployed = {
    JWT_SECRET: strongSecret,
    DB_PASSWORD: 'a-real-database-password',
    CORS_ORIGIN: 'https://admin.kuybi.com,https://kuybi.com'
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
  it('rejects an unknown NODE_ENV instead of booting with development defaults', () => {
    expect(() => validate({ NODE_ENV: 'prod', CORS_ORIGIN: '*' })).toThrow(/NODE_ENV/)
  })

  it('accepts the known environments', () => {
    expect(() => validate({ NODE_ENV: 'test', CORS_ORIGIN: '*' })).not.toThrow()
  })
})
