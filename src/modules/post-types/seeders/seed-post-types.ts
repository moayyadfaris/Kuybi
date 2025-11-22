import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'

import { PostTypesSeeder } from './post-types.seeder'

/**
 * Seed Post Types data
 *
 * Creates:
 * - Story post type (system) with content, excerpt, featured fields
 * - Event post type (custom) with event_date, location, price, max_attendees, description fields
 *
 * Usage:
 * npm run db:seed:post-types
 *
 * OR
 * ts-node -r tsconfig-paths/register src/modules/post-types/seeders/seed-post-types.ts
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)

  const seeder = app.get(PostTypesSeeder)

  try {
    await seeder.seed()
    console.log('✅ Post types seeding completed successfully')
  } catch (error) {
    console.error('❌ Post types seeding failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

bootstrap()
