import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'
import { AclSeeder } from '@modules/acl/seeders/acl.seeder'
import { UsersSeeder } from '@modules/users/seeders/users.seeder'
import { CountriesSeeder } from '@modules/countries/seeders/countries.seeder'
import { Logger } from '@nestjs/common'

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
