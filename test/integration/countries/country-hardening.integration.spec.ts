/**
 * Country edge cases: the search matches literally and is bounded, updatedAt follows
 * changes, and stories accept only an existing, active country (400, not a 500 from the
 * foreign key).
 */
import { CountriesModule } from '@modules/countries/countries.module'
import { Country } from '@modules/countries/entities/country.entity'
import { CountryRepository } from '@modules/countries/repositories/country.repository'
import { StoriesModule } from '@modules/stories/stories.module'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_versions',
  'stories',
  'countries',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Country hardening', () => {
  let t: HttpTestApp
  let author: Actor
  let active: Country
  let retired: Country

  const list = (query: Record<string, string>) => t.http().get('/api/v1/countries').query(query)

  beforeAll(async () => {
    t = await createHttpTestApp([CountriesModule, StoriesModule], { resetTables: TABLES })
    author = await t.signUp('author@country-hardening.test', 'user')
    ;[active, retired] = await t.dataSource.getRepository(Country).save([
      { iso: 'JO', iso3: 'JOR', name: 'JORDAN', nicename: 'Jordan', isActive: true },
      { iso: 'XX', iso3: 'XXX', name: 'RETIRED', nicename: 'Retired', isActive: false }
    ] as Country[])
  })

  beforeEach(() => t.cache.reset())

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('matches % and _ in a search literally, and bounds its length', async () => {
    const res = await list({ search: '_' }).expect(200)
    expect(res.body.data.total).toBe(0)
    await list({ search: 'x'.repeat(101) }).expect(400)
  })

  it('moves updatedAt on a change', async () => {
    const before = active.updatedAt
    await t.app.get(CountryRepository).update(active.id, { capital: 'Amman' })

    const after = await t.dataSource.getRepository(Country).findOneByOrFail({ id: active.id })
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('lets a story use only an existing, active country', async () => {
    const create = (countryId: number) =>
      t.http().post('/api/v1/stories').set(author.auth).send({
        title: 'A story',
        details: 'Some details',
        type: 'REPORT',
        status: 'DRAFT',
        priority: 'NORMAL',
        countryId
      })

    await create(999999).expect(400)
    await create(retired.id).expect(400)
    const story = (await create(active.id).expect(201)).body.data

    await t
      .http()
      .patch(`/api/v1/stories/${story.id}`)
      .set(author.auth)
      .send({ countryId: 999999 })
      .expect(400)
  })
})
