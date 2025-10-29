import { Injectable } from '@nestjs/common'
import { Country } from '@modules/countries/entities/country.entity'
import { ListCountriesQueryDto } from '@modules/countries/dto/list-countries.query.dto'
import { CacheService } from '@core/cache/services/cache.service'
import { CountryRepository } from '@core/database/repositories/country.repository'

@Injectable()
export class CountriesService {
  constructor(
    private readonly countryRepository: CountryRepository,
    private readonly cacheService: CacheService
  ) {}

  async searchCountries(query: ListCountriesQueryDto) {
    // Build cache key based on query parameters
    const cacheKey = this.buildCacheKey(query)

    // Try to get from cache first
    const cached = await this.cacheService.get<any>(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }

    // Use repository's search method
    const result = await this.countryRepository.search({
      search: query.search,
      continent: query.continent,
      isActive: query.isActive,
      fields: query.fields,
      orderBy: query.orderBy,
      orderDirection: query.orderDirection?.toUpperCase() as 'ASC' | 'DESC',
      page: query.page,
      limit: query.limit
    })

    const response = {
      results: result.results,
      total: result.total,
      pagination: result.pagination,
      metadata: {
        criteria: {
          search: query.search,
          continent: query.continent,
          isActive: query.isActive,
          fields: query.fields,
          orderBy: query.orderBy,
          orderDirection: query.orderDirection
        }
      }
    }

    // Cache the response (1 hour TTL for countries data)
    await this.cacheService.set(cacheKey, response, 3600)

    return { ...response, cached: false }
  }

  /**
   * Get country by ID with caching
   */
  async findById(id: number): Promise<Country | null> {
    return this.countryRepository.findById(id)
  }

  /**
   * Get country by ISO code with caching
   */
  async findByIso(iso: string): Promise<Country | null> {
    return this.countryRepository.findByIso(iso)
  }

  /**
   * Get country by ISO3 code with caching
   */
  async findByIso3(iso3: string): Promise<Country | null> {
    return this.countryRepository.findByIso3(iso3)
  }

  /**
   * Get countries by continent
   */
  async findByContinent(continent: string): Promise<Country[]> {
    return this.countryRepository.findByContinent(continent)
  }

  /**
   * Get countries by region
   */
  async findByRegion(region: string): Promise<Country[]> {
    return this.countryRepository.findByRegion(region)
  }

  /**
   * Get all active countries
   */
  async findAllActive(): Promise<Country[]> {
    return this.countryRepository.findAllActive()
  }

  /**
   * Get countries grouped by continent
   */
  async getGroupedByContinent(): Promise<Record<string, Country[]>> {
    return this.countryRepository.findGroupedByContinent()
  }

  /**
   * Get countries grouped by region
   */
  async getGroupedByRegion(): Promise<Record<string, Country[]>> {
    return this.countryRepository.findGroupedByRegion()
  }

  /**
   * Get country statistics
   */
  async getStats() {
    return this.countryRepository.getStats()
  }

  /**
   * Invalidate country cache
   * Call this after updating countries data
   */
  async invalidateCache(): Promise<void> {
    await this.countryRepository.invalidateAllCaches()
  }

  private buildCacheKey(query: ListCountriesQueryDto): string {
    const keyParts = ['countries', 'list', `page:${query.page ?? 0}`, `limit:${query.limit ?? 50}`]

    if (query.search) {
      keyParts.push(`search:${query.search}`)
    }
    if (query.continent) {
      keyParts.push(`continent:${query.continent}`)
    }
    if (typeof query.isActive === 'boolean') {
      keyParts.push(`active:${query.isActive}`)
    }
    if (query.orderBy) {
      keyParts.push(`sort:${query.orderBy}:${query.orderDirection ?? 'asc'}`)
    }
    if (query.fields) {
      keyParts.push(`fields:${query.fields.join(',')}`)
    }

    return keyParts.join(':')
  }
}
