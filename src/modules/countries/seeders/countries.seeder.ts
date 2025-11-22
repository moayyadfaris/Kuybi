import { Injectable, Logger } from '@nestjs/common'

import { CountryRepository } from '@core/database/repositories/country.repository'

import { enhancedCountries } from '../data/enhanced-countries'

@Injectable()
export class CountriesSeeder {
  private readonly logger = new Logger(CountriesSeeder.name)

  constructor(private readonly countryRepository: CountryRepository) {}

  async seed() {
    try {
      this.logger.log('Starting countries seeder...')
      for (const countryData of enhancedCountries) {
        const existing = await this.countryRepository.findOne({ iso: countryData.iso })

        if (existing) {
          await this.countryRepository.update(existing.id, countryData)
          this.logger.debug(`Updated country ${countryData.iso}`)
        } else {
          await this.countryRepository.create(countryData)
          this.logger.debug(`Inserted country ${countryData.iso}`)
        }
      }

      this.logger.log('Country seed completed successfully')
    } catch (error) {
      this.logger.error('Failed to seed countries', error)
      throw error
    }
  }
}
