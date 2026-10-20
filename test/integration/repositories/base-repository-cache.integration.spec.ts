/**
 * BaseRepository cache coherence on real Postgres and the real Redis-backed cache.
 *
 * Every cached read must be dropped by every write through the repository. findOne,
 * findAll and findMany used to cache without the entity tag that writes invalidate, so
 * they served the old row until their TTL (1 hour by default) ran out.
 */
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import { DataSource, Repository } from 'typeorm'

import { Category } from '@modules/categories/entities/category.entity'

import { CacheConfigModule } from '@core/cache/cache.module'
import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { resetDatabase } from '../../helpers/reset-database'
import { testConfig } from '../../test.config'

/** Exercises BaseRepository itself; the unique name keeps its cache keys private */
class ProbeRepository extends BaseRepository<Category> {
  protected entityName = `zz-base-repo-${process.pid}`
  constructor(repository: Repository<Category>, cache: CacheService) {
    super(repository, cache)
  }

  /** The newest row: picked by a query, so a new row can take its place */
  newest(selection: boolean): Promise<Category | null> {
    return this.cached(
      this.buildCacheKey('newest', String(selection)),
      () => this.repository.findOne({ where: {}, order: { createdAt: 'DESC', id: 'DESC' } }),
      undefined,
      { selection }
    )
  }
}

describe('BaseRepository cache coherence (real Redis)', () => {
  let moduleRef: TestingModule
  let dataSource: DataSource
  let cache: CacheService
  let repo: ProbeRepository

  const category = (slug: string) => ({ name: slug, slug, isActive: true, metadata: {} })

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ redis: { ...testConfig.redis, ttl: 60 } })]
        }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        CacheConfigModule
      ]
    }).compile()
    cache = moduleRef.get(CacheService)

    dataSource = new DataSource({
      type: 'postgres',
      host: testConfig.database.host,
      port: testConfig.database.port,
      username: testConfig.database.username,
      password: testConfig.database.password,
      database: testConfig.database.database,
      entities: ENTITIES,
      synchronize: false
    })
    await dataSource.initialize()
    repo = new ProbeRepository(dataSource.getRepository(Category), cache)
  })

  afterAll(async () => {
    await repo.invalidateAllCaches()
    await dataSource.destroy()
    await moduleRef.close()
  })

  beforeEach(async () => {
    await resetDatabase(dataSource, ['story_categories', 'categories'])
    await repo.invalidateAllCaches()
  })

  it('findById sees an update', async () => {
    const saved = await repo.create(category('by-id'))
    await repo.findById(saved.id) // warm the cache

    await repo.update(saved.id, { name: 'renamed' })

    expect((await repo.findById(saved.id))?.name).toBe('renamed')
  })

  it('findOne sees a save', async () => {
    const saved = await repo.create(category('find-one'))
    await repo.findOne({ slug: 'find-one' })

    await repo.save({ ...saved, name: 'renamed' })

    expect((await repo.findOne({ slug: 'find-one' }))?.name).toBe('renamed')
  })

  it('findAll sees a create', async () => {
    await repo.create(category('first'))
    await repo.findAll()

    await repo.create(category('second'))

    expect((await repo.findAll()).map(c => c.slug).sort()).toEqual(['first', 'second'])
  })

  it('findMany with a cache key sees a delete', async () => {
    const a = await repo.create(category('a'))
    await repo.create(category('b'))
    const list = () => repo.findMany({ order: { slug: 'ASC' } }, { cacheKey: `${process.pid}:all` })
    await list()

    await repo.delete(a.id)

    expect((await list()).map(c => c.slug)).toEqual(['b'])
  })

  it('transaction invalidates after the work commits', async () => {
    const saved = await repo.create(category('tx'))
    await repo.findById(saved.id)

    await repo.transaction(manager => manager.update(Category, saved.id, { name: 'in-tx' }))

    expect((await repo.findById(saved.id))?.name).toBe('in-tx')
  })

  it('transaction with touched ids drops only those rows (and the lists)', async () => {
    const changed = await repo.create(category('changed'))
    const other = await repo.create(category('other'))
    await repo.findById(changed.id)
    await repo.findById(other.id)
    await repo.findAll()
    // Written behind the cache's back: only a stale cache would still show 'other'
    await dataSource.getRepository(Category).update(other.id, { name: 'db-only' })

    await repo.transaction(manager => manager.update(Category, changed.id, { name: 'new' }), {
      touched: [changed.id]
    })

    expect((await repo.findById(changed.id))?.name).toBe('new')
    expect((await repo.findById(other.id))?.name).toBe('other') // still cached
    expect((await repo.findAll()).map(c => c.name).sort()).toEqual(['db-only', 'new'])
  })

  it('a write drops its own row, not every row of the entity', async () => {
    const a = await repo.create(category('row-a'))
    const b = await repo.create(category('row-b'))
    await repo.findById(a.id)
    await repo.findById(b.id)
    await dataSource.getRepository(Category).update(b.id, { name: 'db-only' })

    await repo.update(a.id, { name: 'a2' })

    expect((await repo.findById(a.id))?.name).toBe('a2')
    expect((await repo.findById(b.id))?.name).toBe('row-b') // untouched row stays cached
  })

  it('a selection (a row picked by a query) sees a newer row; a plain row cache would not', async () => {
    await repo.create(category('older'))
    expect((await repo.newest(true))?.slug).toBe('older')
    expect((await repo.newest(false))?.slug).toBe('older')

    await repo.create(category('newer'))

    expect((await repo.newest(true))?.slug).toBe('newer')
    // Tagged with the old row only: why lookups like "latest version" are selections
    expect((await repo.newest(false))?.slug).toBe('older')
  })

  it('transaction leaves the cache alone when the work rolls back', async () => {
    const saved = await repo.create(category('rollback'))
    await repo.findById(saved.id)

    await expect(
      repo.transaction(async manager => {
        await manager.update(Category, saved.id, { name: 'never' })
        throw new Error('abort')
      })
    ).rejects.toThrow('abort')

    expect((await repo.findById(saved.id))?.name).toBe('rollback')
  })
})
