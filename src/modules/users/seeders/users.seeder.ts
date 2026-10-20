import { Injectable, Logger } from '@nestjs/common'
import { isLocalEnvironment } from '@shared/utils/environment'

import { PasswordHasher } from '@core/security'

import { UserRepository } from '../repositories/user.repository'

/** Development/test only: deployed environments must set SEED_ADMIN_PASSWORD */
const LOCAL_ADMIN_PASSWORD = 'Admin@123'

/**
 * The first super-admin's password. A well-known default would hand anyone super-admin on
 * a deployed instance seeded without changing it, so only local environments get one.
 */
export function seedAdminPassword(env = process.env): string {
  const password = env.SEED_ADMIN_PASSWORD
  if (password) return password
  if (isLocalEnvironment(env.NODE_ENV ?? 'development')) return LOCAL_ADMIN_PASSWORD
  throw new Error(`SEED_ADMIN_PASSWORD is required to seed the admin user in ${env.NODE_ENV}`)
}

@Injectable()
export class UsersSeeder {
  private readonly logger = new Logger(UsersSeeder.name)

  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async seed() {
    try {
      const adminEmail = 'admin@kuybi.dev'
      const existing = await this.userRepository.findOne({ email: adminEmail })

      if (existing) {
        this.logger.log('Admin user already exists')
        return
      }

      const passwordHash = await this.passwordHasher.hash(seedAdminPassword())

      await this.userRepository.create({
        name: 'Kuybi Admin',
        email: adminEmail,
        mobileNumber: null,
        passwordHash,
        primaryRoleId: 1, // Super-admin role (ID 1 from ACL seeder)
        isActive: true,
        isVerified: true
      })

      this.logger.log('Admin user seeded successfully')
    } catch (error) {
      this.logger.error('Failed to seed users', error)
      throw error
    }
  }
}
