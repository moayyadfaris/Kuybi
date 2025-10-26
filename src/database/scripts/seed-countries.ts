import { AppDataSource } from '../data-source'
import { enhancedCountries } from '../../countries/data/enhanced-countries'
import { Country } from '../../countries/entities/country.entity'

async function seedCountries() {
  try {
    await AppDataSource.initialize()
    const countryRepository = AppDataSource.getRepository(Country)

    for (const countryData of enhancedCountries) {
      const existing = await countryRepository.findOne({ where: { iso: countryData.iso } })

      if (existing) {
        await countryRepository.update({ iso: countryData.iso }, countryData)
        console.log(`Updated country ${countryData.iso}`)
      } else {
        await countryRepository.insert(countryData)
        console.log(`Inserted country ${countryData.iso}`)
      }
    }

    console.log('Country seed completed successfully')
  } catch (error) {
    console.error('Failed to seed countries', error)
    process.exitCode = 1
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  }
}

seedCountries()
