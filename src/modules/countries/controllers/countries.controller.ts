import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { ListCountriesQueryDto } from '../dto/list-countries.query.dto'
import { CountriesService } from '../services/countries.service'

@ApiTags('countries')
@Controller('v1/countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated list of countries' })
  async listCountries(@Query() query: ListCountriesQueryDto) {
    return this.countriesService.searchCountries(query)
  }
}
