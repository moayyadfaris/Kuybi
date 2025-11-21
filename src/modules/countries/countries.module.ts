import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CountriesController } from './controllers/countries.controller'
import { CountriesService } from './services/countries.service'
import { Country } from './entities/country.entity'
import { CountryRepository } from '@core/database/repositories/country.repository'
import { CacheService } from '@core/cache/services/cache.service'

import { CountriesSeeder } from './seeders/countries.seeder'

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountriesController],
  providers: [CountriesService, CountryRepository, CacheService, CountriesSeeder],
  exports: [CountriesService, CountryRepository]
})

export class CountriesModule { }
