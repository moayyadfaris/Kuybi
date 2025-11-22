import { Injectable, Logger } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

import { UserRepository } from '@core/database/repositories/user.repository'

@Injectable()
export class UsersSeeder {
  private readonly logger = new Logger(UsersSeeder.name)

  constructor(private readonly userRepository: UserRepository) {}

  async seed() {
    try {
      const adminEmail = 'admin@kuybi.dev'
      const existing = await this.userRepository.findOne({ email: adminEmail })

      if (existing) {
        this.logger.log('Admin user already exists')
        return
      }

      const passwordHash = await bcrypt.hash('Admin@123', 10)

      await this.userRepository.create({
        name: 'Kuybi Admin',
        email: adminEmail,
        mobileNumber: '0000000000',
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
