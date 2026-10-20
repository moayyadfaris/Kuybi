/**
 * Public country search: filters, field selection, ordering and pagination.
 */
import { CountriesModule } from '@modules/countries/countries.module'
import { Country } from '@modules/countries/entities/country.entity'
import { CountryRepository } from '@modules/countries/repositories/country.repository'

import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'countries',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Countries', () => {
  let t: HttpTestApp

  const list = (query: Record<string, string | number | boolean> = {}) =>
    t.http().get('/api/v1/countries').query(query).expect(200)
  const names = (res: { body: { data: { results: Array<{ name: string }> } } }) =>
    res.body.data.results.map(c => c.name)

  beforeAll(async () => {
    t = await createHttpTestApp([CountriesModule], { resetTables: TABLES })
    await t.dataSource.getRepository(Country).save([
      {
        iso: 'JO',
        iso3: 'JOR',
        name: 'JORDAN',
        nicename: 'Jordan',
        continent: 'Asia',
        phonecode: 962,
        currencyCode: 'JOD',
        isActive: true
      },
      {
        iso: 'FR',
        iso3: 'FRA',
        name: 'FRANCE',
        nicename: 'France',
        continent: 'Europe',
        phonecode: 33,
        currencyCode: 'EUR',
        isActive: true
      },
      {
        iso: 'DE',
        iso3: 'DEU',
        name: 'GERMANY',
        nicename: 'Germany',
        continent: 'Europe',
        phonecode: 49,
        currencyCode: 'EUR',
        isActive: true
      },
      {
        iso: 'XX',
        iso3: 'XXX',
        name: 'RETIRED',
        nicename: 'Retired',
        continent: 'Europe',
        phonecode: 0,
        isActive: false
      }
    ] as Country[])
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  beforeEach(() => t.cache.reset())

  it('is public and lists every country by name', async () => {
    const res = await list()

    expect(names(res)).toEqual(['FRANCE', 'GERMANY', 'JORDAN', 'RETIRED'])
    expect(res.body.data.total).toBe(4)
  })

  it('filters by continent and active flag', async () => {
    expect(names(await list({ continent: 'Europe', isActive: true }))).toEqual([
      'FRANCE',
      'GERMANY'
    ])
    expect(names(await list({ isActive: false }))).toEqual(['RETIRED'])
  })

  it('searches name and ISO codes case-insensitively, within the other filters', async () => {
    expect(names(await list({ search: 'jor' }))).toEqual(['JORDAN'])
    expect(names(await list({ search: 'deu' }))).toEqual(['GERMANY'])
    // The search ORs its columns but must still respect continent
    expect(names(await list({ search: 'an', continent: 'Asia' }))).toEqual(['JORDAN'])
  })

  it('orders and paginates', async () => {
    const byPhone = await list({ orderBy: 'phonecode', orderDirection: 'desc', isActive: true })
    expect(names(byPhone)).toEqual(['JORDAN', 'GERMANY', 'FRANCE'])

    const page1 = await list({ limit: 2, page: 1 })
    expect(names(page1)).toEqual(['JORDAN', 'RETIRED'])
    expect(page1.body.data.pagination).toEqual({ page: 1, limit: 2, totalPages: 2 })
  })

  it('returns only the requested fields', async () => {
    const res = await list({ fields: 'iso,name', search: 'fra' })

    expect(res.body.data.results).toEqual([{ iso: 'FR', name: 'FRANCE' }])
  })

  it('serves a country change at once (the seeder updates through the repository)', async () => {
    expect(names(await list({ search: 'jordan' }))).toEqual(['JORDAN']) // now cached

    const jordan = await t.dataSource.getRepository(Country).findOneByOrFail({ iso: 'JO' })
    await t.app.get(CountryRepository).update(jordan.id, { name: 'HASHEMITE KINGDOM OF JORDAN' })

    expect(names(await list({ search: 'jordan' }))).toEqual(['HASHEMITE KINGDOM OF JORDAN'])
    await t.app.get(CountryRepository).update(jordan.id, { name: 'JORDAN' })
  })

  it('rejects unknown order fields', async () => {
    await t.http().get('/api/v1/countries').query({ orderBy: 'id; DROP TABLE' }).expect(400)
  })
})
