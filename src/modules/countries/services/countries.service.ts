import { Injectable } from '@nestjs/common'

import { ListCountriesQueryDto } from '../dto/list-countries.query.dto'
import { Country } from '../entities/country.entity'
import { CountryRepository } from '../repositories/country.repository'

@Injectable()
export class CountriesService {
  constructor(private readonly countryRepository: CountryRepository) {}

  async searchCountries(query: ListCountriesQueryDto) {
    // Cached by the repository (invalidated by country writes)
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

    return {
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
}
