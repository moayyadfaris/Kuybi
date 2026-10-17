/**
 * Soft-delete filtering in repositories
 *
 * Role and Category store `deletedAt` in a plain column, so every lookup has to filter
 * on it explicitly. A plain `deletedAt: null` in TypeORM find options is silently
 * dropped (no IS NULL is generated), which made soft-deleted rows visible.
 */
import { DataSource } from 'typeorm'

import { Role } from '@modules/acl/entities/role.entity'
import { Category } from '@modules/categories/entities/category.entity'

import { CacheService } from '@core/cache/services/cache.service'
import { ENTITIES } from '@core/database/entities'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { RoleRepository } from '@core/database/repositories/role.repository'

import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { resetDatabase } from '../../helpers/reset-database'

describe('Repository soft-delete filtering (integration)', () => {
  let dataSource: DataSource
  let roles: RoleRepository
  let categories: CategoryRepository

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
    await resetDatabase(dataSource, ['role_permissions', 'user_roles', 'roles', 'categories'])
    const cache = new InMemoryCacheService() as unknown as CacheService
    roles = new RoleRepository(dataSource.getRepository(Role), cache)
    categories = new CategoryRepository(dataSource.getRepository(Category), cache)

    const roleRepo = dataSource.getRepository(Role)
    await roleRepo.save([
      { name: 'editor', isActive: true, isSystem: true, priority: 60 },
      { name: 'retired', isActive: true, isSystem: true, priority: 40, deletedAt: new Date() }
    ])
    const categoryRepo = dataSource.getRepository(Category)
    await categoryRepo.save([
      { name: 'Live', slug: 'live', isActive: true, metadata: {} },
      { name: 'Gone', slug: 'gone', isActive: true, metadata: {}, deletedAt: new Date() }
    ])
  })

  it('does not find a soft-deleted role by name', async () => {
    expect(await roles.findByName('editor')).not.toBeNull()
    expect(await roles.findByName('retired')).toBeNull()
  })

  it('excludes soft-deleted roles from the active list', async () => {
    const names = (await roles.findActive()).map(r => r.name)
    expect(names).toContain('editor')
    expect(names).not.toContain('retired')
  })

  it('does not find a soft-deleted category by slug', async () => {
    expect(await categories.findBySlug('live')).not.toBeNull()
    expect(await categories.findBySlug('gone')).toBeNull()
  })
})
