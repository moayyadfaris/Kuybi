import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CountriesController } from './controllers/countries.controller'
import { Country } from './entities/country.entity'
import { CountryRepository } from './repositories/country.repository'
import { CountriesSeeder } from './seeders/countries.seeder'
import { CountriesService } from './services/countries.service'

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountriesController],
  providers: [CountriesService, CountryRepository, CountriesSeeder],
  exports: [CountryRepository]
})
export class CountriesModule {}
