/**
 * User test data factory
 * Generate test user data
 */

import * as bcrypt from 'bcrypt'

import { User } from '@modules/users/entities/user.entity'

export class UserFactory {
  private static counter = 0

  /**
   * Create a test user with default values
   */
  static create(
    overrides: Partial<User> & { password?: string } = {}
  ): Partial<User> & { password?: string } {
    this.counter++

    return {
      email: overrides.email || `testuser${this.counter}@example.com`,
      name: overrides.name || `Test User ${this.counter}`,
      mobileNumber: overrides.mobileNumber || `+1234567${this.counter.toString().padStart(4, '0')}`,
      password: overrides.password || 'Password123!',
      primaryRoleId: overrides.primaryRoleId || 4, // Default to 'user' role
      isActive: overrides.isActive !== undefined ? overrides.isActive : true,
      isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true,
      ...overrides
    }
  }

  /**
   * Create multiple test users
   */
  static createMany(
    count: number,
    overrides: Partial<User> & { password?: string } = {}
  ): (Partial<User> & { password?: string })[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }

  /**
   * Create an admin user
   */
  static createAdmin(
    overrides: Partial<User> & { password?: string } = {}
  ): Partial<User> & { password?: string } {
    return this.create({
      email: 'admin@example.com',
      name: 'Admin User',
      mobileNumber: '+10000000001',
      primaryRoleId: 1, // super-admin role
      ...overrides
    })
  }

  /**
   * Create a user with hashed password
   */
  static async createWithHashedPassword(
    overrides: Partial<User> & { password?: string } = {}
  ): Promise<Partial<User>> {
    const user = this.create(overrides)
    const { password, ...userData } = user
    if (password) {
      return {
        ...userData,
        passwordHash: await bcrypt.hash(password, 10)
      }
    }
    return userData
  }

  /**
   * Reset counter (useful between tests)
   */
  static reset(): void {
    this.counter = 0
  }
}
