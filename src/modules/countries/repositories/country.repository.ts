import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { containsPattern } from '@shared/utils/like.util'
import { Brackets, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Country } from '../entities/country.entity'

/** Columns search() may sort by (they become SQL identifiers) */
export const COUNTRY_SORT_FIELDS = ['name', 'continent', 'currencyCode', 'phonecode'] as const

export interface CountrySearch {
  search?: string
  continent?: string
  isActive?: boolean
  fields?: string[]
  orderBy?: string
  orderDirection?: 'ASC' | 'DESC'
  /** 0-based */
  page?: number
  limit?: number
}

/** Countries (reference data written by the seeder), cached under ADR 0003 */
@Injectable()
export class CountryRepository extends BaseRepository<Country> {
  protected entityName = 'country'
  protected defaultTTL = 3600 // 1 hour for country data (rarely changes)

  constructor(
    @InjectRepository(Country) repository: Repository<Country>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  findByIso(iso: string): Promise<Country | null> {
    const code = iso.toUpperCase()
    return this.cached(this.buildCacheKey('iso', code), () =>
      this.repository.findOne({ where: { iso: code } })
    )
  }

  /**
   * A page of countries. Free-text searches are not cached: every distinct term would be
   * its own entry, and the table is small enough to query.
   */
  search(query: CountrySearch) {
    if (query.search) return this.runSearch(query)
    return this.cached(this.buildCacheKey('search', JSON.stringify(query)), () =>
      this.runSearch(query)
    )
  }

  private async runSearch(query: CountrySearch): Promise<{
    results: Country[] | Partial<Country>[]
    total: number
    pagination: { page: number; limit: number; totalPages: number }
  }> {
    const builder = this.repository.createQueryBuilder('country')
    if (query.search) {
      const pattern = containsPattern(query.search)
      builder.where(
        new Brackets(qb => {
          qb.where('country.name ILIKE :pattern', { pattern })
            .orWhere('country.nicename ILIKE :pattern', { pattern })
            .orWhere('country.iso ILIKE :pattern', { pattern })
            .orWhere('country.iso3 ILIKE :pattern', { pattern })
        })
      )
    }
    if (query.continent) {
      builder.andWhere('country.continent = :continent', { continent: query.continent })
    }
    if (query.isActive !== undefined) {
      builder.andWhere('country.isActive = :isActive', { isActive: query.isActive })
    }

    const orderBy = (COUNTRY_SORT_FIELDS as readonly string[]).includes(query.orderBy ?? '')
      ? query.orderBy
      : 'name'
    const page = query.page ?? 0
    const limit = query.limit ?? 50
    const [results, total] = await builder
      .orderBy(`country.${orderBy}`, query.orderDirection === 'DESC' ? 'DESC' : 'ASC')
      .addOrderBy('country.id', 'ASC')
      .skip(page * limit)
      .take(limit)
      .getManyAndCount()

    return {
      results: query.fields?.length ? selectFields(results, query.fields) : results,
      total,
      pagination: { page, limit, totalPages: Math.ceil(total / limit) }
    }
  }
}

/** Only the requested fields of each country (unknown names are ignored) */
function selectFields(countries: Country[], fields: string[]): Partial<Country>[] {
  return countries.map(country =>
    Object.fromEntries(
      fields
        .filter(field => field in country)
        .map(field => [field, country[field as keyof Country]])
    )
  )
}
