import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'
import { TagsSeeder } from './tags.seeder'

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule)

    const seeder = app.get(TagsSeeder)

    try {
        await seeder.seed()
        console.log('✅ Tags seeding completed successfully')
    } catch (error) {
        console.error('❌ Tags seeding failed:', error)
        process.exit(1)
    } finally {
        await app.close()
    }
}

bootstrap()
