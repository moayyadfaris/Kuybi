import { Injectable } from '@nestjs/common'

import { ListCountriesQueryDto } from '../dto/list-countries.query.dto'
import { CountryRepository } from '../repositories/country.repository'

/** The public country list (search, filters, field selection, 0-based pages) */
@Injectable()
export class CountriesService {
  constructor(private readonly countryRepository: CountryRepository) {}

  async searchCountries(query: ListCountriesQueryDto) {
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
      ...result,
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
}
