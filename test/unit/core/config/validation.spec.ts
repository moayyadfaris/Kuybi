import { assertProductionSecrets } from '@core/config/validation'

describe('assertProductionSecrets', () => {
  const strongSecret = 'x'.repeat(48)

  it('is a no-op outside production', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'development' })).not.toThrow()
  })

  it('accepts strong production secrets', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: strongSecret,
        DB_PASSWORD: 'a-real-database-password'
      })
    ).not.toThrow()
  })

  it('rejects a missing JWT_SECRET in production', () => {
    expect(() =>
      assertProductionSecrets({ NODE_ENV: 'production', DB_PASSWORD: 'a-real-database-password' })
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
