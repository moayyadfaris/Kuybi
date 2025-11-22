import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'

import { UsersSeeder } from './users.seeder'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)

  const seeder = app.get(UsersSeeder)

  try {
    await seeder.seed()
    console.log('✅ Users seeding completed successfully')
  } catch (error) {
    console.error('❌ Users seeding failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

bootstrap()
