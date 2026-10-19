import { seedAdminPassword } from '@modules/users/seeders/users.seeder'

describe('seeded admin password', () => {
  it('uses SEED_ADMIN_PASSWORD when set', () => {
    expect(seedAdminPassword({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'S3cret!pass' })).toBe(
      'S3cret!pass'
    )
  })

  it('has a default only in development and test', () => {
    expect(seedAdminPassword({ NODE_ENV: 'development' })).toBe('Admin@123')
    expect(seedAdminPassword({ NODE_ENV: 'test' })).toBe('Admin@123')
    expect(() => seedAdminPassword({ NODE_ENV: 'production' })).toThrow(/SEED_ADMIN_PASSWORD/)
    expect(() => seedAdminPassword({ NODE_ENV: 'staging' })).toThrow(/SEED_ADMIN_PASSWORD/)
  })
})
