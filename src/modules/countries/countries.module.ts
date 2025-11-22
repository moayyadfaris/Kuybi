import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { CountryRepository } from '@core/database/repositories/country.repository'

import { CountriesController } from './controllers/countries.controller'
import { Country } from './entities/country.entity'
import { CountriesSeeder } from './seeders/countries.seeder'
import { CountriesService } from './services/countries.service'

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountriesController],
  providers: [CountriesService, CountryRepository, CacheService, CountriesSeeder],
  exports: [CountriesService, CountryRepository]
})
export class CountriesModule {}
