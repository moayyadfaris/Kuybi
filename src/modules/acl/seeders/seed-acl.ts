import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'
import { AclSeeder } from './acl.seeder'

/**
 * Seed ACL (Access Control List) data
 * 
 * Usage:
 * npm run seed:acl
 * 
 * OR
 * ts-node -r tsconfig-paths/register src/acl/seeders/seed-acl.ts
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  
  const seeder = app.get(AclSeeder)
  
  try {
    await seeder.seed()
    console.log('✅ ACL seeding completed successfully')
  } catch (error) {
    console.error('❌ ACL seeding failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }
}

bootstrap()
