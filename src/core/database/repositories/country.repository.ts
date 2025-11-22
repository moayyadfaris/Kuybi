import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'

import { Country } from '@modules/countries/entities/country.entity'

import { CacheService } from '../../cache/services/cache.service'

import { BaseRepository } from './base.repository'

/**
 * Country Repository
 *
 * Handles all database operations for Country entity with caching.
 */
@Injectable()
export class CountryRepository extends BaseRepository<Country> {
  protected entityName = 'country'
  protected defaultTTL = 3600 // 1 hour for country data (rarely changes)

  constructor(
    @InjectRepository(Country)
    repository: Repository<Country>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find country by ISO code with caching
   */
  async findByIso(iso: string): Promise<Country | null> {
    const cacheKey = this.buildCacheKey('iso', iso.toUpperCase())

    return this.cacheService.wrap<Country>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { iso: iso.toUpperCase() } })
      },
      this.defaultTTL
    )
  }

  /**
   * Find country by ISO3 code with caching
   */
  async findByIso3(iso3: string): Promise<Country | null> {
    const cacheKey = this.buildCacheKey('iso3', iso3.toUpperCase())

    return this.cacheService.wrap<Country>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { iso3: iso3.toUpperCase() } })
      },
      this.defaultTTL
    )
  }

  /**
   * Find countries by continent with caching
   */
  async findByContinent(continent: string): Promise<Country[]> {
    const cacheKey = this.buildCacheKey('continent', continent)

    return this.cacheService.wrap<Country[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { continent },
          order: { name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find countries by region with caching
   */
  async findByRegion(region: string): Promise<Country[]> {
    const cacheKey = this.buildCacheKey('region', region)

    return this.cacheService.wrap<Country[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { region },
          order: { name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Advanced search with filters, sorting, and pagination
   */
  async search(query: {
    search?: string
    continent?: string
    region?: string
    isActive?: boolean
    fields?: string[]
    orderBy?: string
    orderDirection?: 'ASC' | 'DESC'
    page?: number
    limit?: number
  }): Promise<{
    results: Country[] | Partial<Country>[]
    total: number
    pagination: {
      page: number
      limit: number
      totalPages: number
    }
  }> {
    const builder = this.repository.createQueryBuilder('country')

    // Apply search
    if (query.search) {
      builder.where(
        new Brackets(qb => {
          qb.where('country.name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('country.nicename ILIKE :search', { search: `%${query.search}%` })
            .orWhere('country.iso ILIKE :search', { search: `%${query.search}%` })
            .orWhere('country.iso3 ILIKE :search', { search: `%${query.search}%` })
        })
      )
    }

    // Apply filters
    if (query.continent) {
      builder.andWhere('country.continent = :continent', { continent: query.continent })
    }

    if (query.region) {
      builder.andWhere('country.region = :region', { region: query.region })
    }

    if (query.isActive !== undefined) {
      builder.andWhere('country.isActive = :isActive', { isActive: query.isActive })
    }

    // Apply sorting
    const orderBy = query.orderBy || 'name'
    const orderDirection = query.orderDirection || 'ASC'
    builder.orderBy(`country.${orderBy}`, orderDirection)

    // Apply pagination
    const page = query.page ?? 0
    const limit = query.limit ?? 50
    builder.skip(page * limit).take(limit)

    // Execute query
    const [results, total] = await builder.getManyAndCount()

    // Select specific fields if requested
    const finalResults = query.fields ? this.selectFields(results, query.fields) : results

    return {
      results: finalResults,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0
      }
    }
  }

  /**
   * Get all active countries with caching
   */
  async findAllActive(): Promise<Country[]> {
    const cacheKey = this.buildCacheKey('all-active')

    return this.cacheService.wrap<Country[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true },
          order: { name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Get grouped countries by continent
   */
  async findGroupedByContinent(): Promise<Record<string, Country[]>> {
    const cacheKey = this.buildCacheKey('grouped-by-continent')

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const countries = await this.repository.find({
          where: { isActive: true },
          order: { continent: 'ASC', name: 'ASC' }
        })

        const grouped: Record<string, Country[]> = {}
        countries.forEach(country => {
          const continent = country.continent || 'Unknown'
          if (!grouped[continent]) {
            grouped[continent] = []
          }
          grouped[continent].push(country)
        })

        return grouped
      },
      this.defaultTTL
    )
  }

  /**
   * Get grouped countries by region
   */
  async findGroupedByRegion(): Promise<Record<string, Country[]>> {
    const cacheKey = this.buildCacheKey('grouped-by-region')

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const countries = await this.repository.find({
          where: { isActive: true },
          order: { region: 'ASC', name: 'ASC' }
        })

        const grouped: Record<string, Country[]> = {}
        countries.forEach(country => {
          const region = country.region || 'Unknown'
          if (!grouped[region]) {
            grouped[region] = []
          }
          grouped[region].push(country)
        })

        return grouped
      },
      this.defaultTTL
    )
  }

  /**
   * Get country statistics
   */
  async getStats(): Promise<{
    total: number
    active: number
    byContinent: Record<string, number>
    byRegion: Record<string, number>
  }> {
    const cacheKey = this.buildCacheKey('stats')

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const [total, active] = await Promise.all([
          this.repository.count(),
          this.repository.count({ where: { isActive: true } })
        ])

        // Count by continent
        const continentQuery = await this.repository
          .createQueryBuilder('country')
          .select('country.continent', 'continent')
          .addSelect('COUNT(*)', 'count')
          .groupBy('country.continent')
          .getRawMany()

        const byContinent: Record<string, number> = {}
        continentQuery.forEach(row => {
          byContinent[row.continent || 'Unknown'] = parseInt(row.count, 10)
        })

        // Count by region
        const regionQuery = await this.repository
          .createQueryBuilder('country')
          .select('country.region', 'region')
          .addSelect('COUNT(*)', 'count')
          .groupBy('country.region')
          .getRawMany()

        const byRegion: Record<string, number> = {}
        regionQuery.forEach(row => {
          byRegion[row.region || 'Unknown'] = parseInt(row.count, 10)
        })

        return { total, active, byContinent, byRegion }
      },
      600 // 10 minutes TTL for stats
    )
  }

  /**
   * Select specific fields from results
   */
  private selectFields(countries: Country[], fields: string[]): Partial<Country>[] {
    if (!fields || fields.length === 0) return countries

    return countries.map(country => {
      const selected: any = {}
      fields.forEach(field => {
        if (field in country) {
          selected[field] = country[field as keyof Country]
        }
      })
      return selected
    })
  }

  /**
   * Override to add custom cache invalidation
   */
  protected async invalidateListCaches(): Promise<void> {
    await super.invalidateListCaches()

    // Invalidate specific country caches
    await this.cacheService.delPattern(`${this.entityName}:iso:*`)
    await this.cacheService.delPattern(`${this.entityName}:iso3:*`)
    await this.cacheService.delPattern(`${this.entityName}:continent:*`)
    await this.cacheService.delPattern(`${this.entityName}:region:*`)
    await this.cacheService.delPattern(`${this.entityName}:all-active`)
    await this.cacheService.delPattern(`${this.entityName}:grouped-*`)
    await this.cacheService.delPattern(`${this.entityName}:stats`)
  }
}
