import { NestFactory } from '@nestjs/core'
import { AppModule } from '@app/app.module'

import { AclSeeder } from './acl.seeder'

/**
 * Seeds roles and permissions (AclSeeder): `npm run db:seed:acl`, or
 * `npm run db:seed:acl:prod` from the build. Safe to run again after upgrades.
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
