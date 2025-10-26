import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { User } from './entities/user.entity'
import { UserRepository } from '../database/repositories/user.repository'

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email)
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id)
  }

  async createUser(payload: {
    name: string
    email: string
    mobileNumber: string
    password: string
    role?: string
    isVerified?: boolean
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(payload.password, 10)
    
    return this.userRepository.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      mobileNumber: payload.mobileNumber,
      passwordHash,
      role: payload.role ?? 'ROLE_USER',
      isVerified: payload.isVerified ?? false,
    })
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    return this.userRepository.update(id, data)
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.userRepository.delete(id)
  }

  async searchUsers(query: {
    search?: string
    role?: string
    isActive?: boolean
    isVerified?: boolean
    limit?: number
    offset?: number
  }): Promise<[User[], number]> {
    return this.userRepository.search(query)
  }

  async getUserStats() {
    return this.userRepository.getStats()
  }

  async updateVerification(id: string, isVerified: boolean): Promise<User | null> {
    return this.userRepository.updateVerification(id, isVerified)
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10)
    return this.userRepository.updatePassword(id, passwordHash)
  }
}
