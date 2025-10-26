import { AppDataSource } from '../data-source'
import { User } from '../../users/entities/user.entity'
import * as bcrypt from 'bcrypt'

async function seedUsers() {
  try {
    await AppDataSource.initialize()
    const userRepository = AppDataSource.getRepository(User)

    const adminEmail = 'admin@susano.dev'
    const existing = await userRepository.findOne({ where: { email: adminEmail } })

    if (existing) {
      console.log('Admin user already exists')
      return
    }

    const passwordHash = await bcrypt.hash('Admin@123', 10)

    const admin = userRepository.create({
      name: 'Susanoo Admin',
      email: adminEmail,
      mobileNumber: '0000000000',
      passwordHash,
      role: 'ROLE_SUPERADMIN',
      isActive: true,
      isVerified: true
    })

    await userRepository.save(admin)
    console.log('Admin user seeded successfully')
  } catch (error) {
    console.error('Failed to seed users', error)
    process.exitCode = 1
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  }
}

seedUsers()
