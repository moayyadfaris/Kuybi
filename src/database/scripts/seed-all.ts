import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'

import { AclSeeder } from '@modules/acl'
import { CategoriesSeeder } from '@modules/categories'
import { CountriesSeeder } from '@modules/countries'
import { StoriesSeeder } from '@modules/stories'
import { TagsSeeder } from '@modules/tags'
import { UsersSeeder } from '@modules/users'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const logger = new Logger('SeedAll')

  try {
    logger.log('🌱 Starting full database seed...')

    // 1. Seed ACL (Roles & Permissions) - Required for Users
    logger.log('--------------------------------------------------')
    logger.log('🛡️  Seeding ACL...')
    const aclSeeder = app.get(AclSeeder)
    await aclSeeder.seed()
    logger.log('✅ ACL seeded successfully')

    // 2. Seed Users (Admin) - Depends on ACL
    logger.log('--------------------------------------------------')
    logger.log('👤 Seeding Users...')
    const usersSeeder = app.get(UsersSeeder)
    await usersSeeder.seed()
    logger.log('✅ Users seeded successfully')

    // 3. Seed Countries - Independent
    logger.log('--------------------------------------------------')
    logger.log('🌍 Seeding Countries...')
    const countriesSeeder = app.get(CountriesSeeder)
    await countriesSeeder.seed()
    logger.log('✅ Countries seeded successfully')

    // 4. Seed Categories - Independent
    logger.log('--------------------------------------------------')
    logger.log('📂 Seeding Categories...')
    const categoriesSeeder = app.get(CategoriesSeeder)
    await categoriesSeeder.seed()
    logger.log('✅ Categories seeded successfully')

    // 5. Seed Tags - Depends on Users (for createdBy)
    logger.log('--------------------------------------------------')
    logger.log('🏷️  Seeding Tags...')
    const tagsSeeder = app.get(TagsSeeder)
    await tagsSeeder.seed()
    logger.log('✅ Tags seeded successfully')

    // 6. Seed Stories - Depends on Users, Countries, Categories, Tags
    logger.log('--------------------------------------------------')
    logger.log('📝 Seeding Stories...')
    const storiesSeeder = app.get(StoriesSeeder)
    await storiesSeeder.seed()
    logger.log('✅ Stories seeded successfully')

    logger.log('--------------------------------------------------')
    logger.log('✨ All seeders completed successfully!')
  } catch (error) {
    logger.error('❌ Seeding failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

bootstrap()
