/**
 * Disabling a role takes its powers away at once, the super-admin role included: holders
 * of a disabled super-admin role are refused super-admin routes.
 */
import { Role } from '@modules/acl/entities/role.entity'
import { AuditModule } from '@modules/audit/audit.module'

import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'audit_logs',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Disabled roles', () => {
  let t: HttpTestApp

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('refuses super-admin routes to holders of a disabled super-admin role', async () => {
    const root = await t.signUp('root@disabled-roles.test', 'super-admin')
    await t.http().get('/api/v1/audit/statistics').set(root.auth).expect(200)

    await t.dataSource.getRepository(Role).update({ name: 'super-admin' }, { isActive: false })
    await t.cache.reset()

    await t.http().get('/api/v1/audit/statistics').set(root.auth).expect(403)
  })
})
