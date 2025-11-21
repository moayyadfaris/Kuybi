import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'
import { StoriesSeeder } from './stories.seeder'

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule)

    const seeder = app.get(StoriesSeeder)

    try {
        await seeder.seed()
        console.log('✅ Stories seeding completed successfully')
    } catch (error) {
        console.error('❌ Stories seeding failed:', error)
        process.exit(1)
    } finally {
        await app.close()
    }
}

bootstrap()
