/**
 * ACL seeder integration test
 *
 * Runs the production ACL seeder against the test database and checks the
 * permissions each role ends up with, including conditional (ownership) rules.
 */
import { ENTITIES } from '@app/database/entities'
import { DataSource } from 'typeorm'

import { Role } from '@modules/acl/entities/role.entity'

import { resetDatabase } from '../../helpers/reset-database'
import { seedRolesWithPermissions } from '../../helpers/role-seeder'

const rulesFor = async (dataSource: DataSource, roleName: string) => {
  const role = await dataSource.getRepository(Role).findOne({
    where: { name: roleName },
    relations: { rolePermissions: { permission: true } }
  })
  return (role?.rolePermissions ?? []).map(rp => ({
    action: rp.permission.action,
    subject: rp.permission.subject,
    conditions: rp.permission.conditions ?? {}
  }))
}

describe('AclSeeder (integration)', () => {
  let dataSource: DataSource

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.TEST_DB_HOST,
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      username: process.env.TEST_DB_USERNAME,
      password: process.env.TEST_DB_PASSWORD,
      database: process.env.TEST_DB_NAME,
      entities: ENTITIES,
      synchronize: false
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await resetDatabase(dataSource, ['role_permissions', 'user_roles', 'roles', 'permissions'])
  })

  it('creates conditional ownership permissions alongside unconditional ones', async () => {
    await seedRolesWithPermissions(dataSource)

    const userRules = await rulesFor(dataSource, 'user')

    expect(userRules).toEqual(
      expect.arrayContaining([
        { action: 'update', subject: 'User', conditions: { id: '${userId}' } },
        { action: 'update', subject: 'Story', conditions: { userId: '${userId}' } },
        { action: 'delete', subject: 'Story', conditions: { userId: '${userId}' } }
      ])
    )
    // Users must not receive the unconditional "update any story" rule
    expect(userRules).not.toContainEqual({ action: 'update', subject: 'Story', conditions: {} })
  })

  it('limits users and guests to their own and public attachments', async () => {
    await seedRolesWithPermissions(dataSource)

    const userRules = await rulesFor(dataSource, 'user')
    expect(userRules).toEqual(
      expect.arrayContaining([
        { action: 'read', subject: 'Attachment', conditions: { userId: '${userId}' } },
        { action: 'read', subject: 'Attachment', conditions: { isPublic: true } }
      ])
    )
    expect(userRules).not.toContainEqual({ action: 'read', subject: 'Attachment', conditions: {} })
    expect(await rulesFor(dataSource, 'guest')).not.toContainEqual({
      action: 'read',
      subject: 'Attachment',
      conditions: {}
    })
  })

  it('revokes the old "read every attachment" grant from already-seeded databases', async () => {
    await seedRolesWithPermissions(dataSource)
    // Simulate a database seeded by an older release
    await dataSource.query(`
      INSERT INTO role_permissions ("roleId", "permissionId")
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.name = 'user' AND p.action = 'read' AND p.subject = 'Attachment'
        AND (p.conditions IS NULL OR p.conditions = '{}'::jsonb)`)
    expect(await rulesFor(dataSource, 'user')).toContainEqual({
      action: 'read',
      subject: 'Attachment',
      conditions: {}
    })

    await seedRolesWithPermissions(dataSource)

    expect(await rulesFor(dataSource, 'user')).not.toContainEqual({
      action: 'read',
      subject: 'Attachment',
      conditions: {}
    })
  })

  it('is idempotent when run twice', async () => {
    await seedRolesWithPermissions(dataSource)
    const first = await dataSource.query('SELECT count(*)::int AS n FROM permissions')
    await seedRolesWithPermissions(dataSource)
    const second = await dataSource.query('SELECT count(*)::int AS n FROM permissions')

    expect(second[0].n).toBe(first[0].n)
  })
})
