import { DatabaseConfig, postgresOptions } from '@app/database/postgres-options'

describe('postgresOptions', () => {
  const base: DatabaseConfig = {
    host: 'db.internal',
    port: 5432,
    username: 'kuybi',
    password: 'secret',
    name: 'kuybi',
    logging: false
  }

  it('connects without TLS unless asked', () => {
    expect(postgresOptions(base).ssl).toBe(false)
  })

  it('verifies the server certificate when TLS is on', () => {
    expect(postgresOptions({ ...base, ssl: { enabled: true } }).ssl).toEqual({
      rejectUnauthorized: true
    })
  })

  it('always bounds how long connecting may take', () => {
    expect(postgresOptions(base).extra).toMatchObject({ connectionTimeoutMillis: 30_000 })
  })
})
