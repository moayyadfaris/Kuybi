import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'

import { CategoriesSeeder } from './categories.seeder'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)

  const seeder = app.get(CategoriesSeeder)

  try {
    await seeder.seed()
    console.log('✅ Categories seeding completed successfully')
  } catch (error) {
    console.error('❌ Categories seeding failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

bootstrap()
