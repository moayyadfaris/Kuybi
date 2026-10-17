import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'

import { Role } from '@modules/acl/entities/role.entity'
import { RegistrationService } from '@modules/auth/services/registration.service'
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { User } from '@modules/users/entities/user.entity'

describe('RegistrationService.register', () => {
  const dto = {
    email: 'new@example.com',
    password: 'Str0ng!Passw0rd',
    firstName: 'New',
    lastName: 'User'
  }

  const build = (userRoleId: number) => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(data => data),
      save: jest.fn(async data => ({ ...data, id: 'user-1' }))
    }
    const emailVerificationRepository = {
      create: jest.fn(data => data),
      save: jest.fn(async data => ({ ...data, id: 'ev-1' }))
    }
    const roleRepository = {
      findOne: jest.fn().mockResolvedValue({ id: userRoleId, name: 'user' })
    }
    const service = new RegistrationService(
      userRepository as unknown as Repository<User>,
      emailVerificationRepository as unknown as Repository<EmailVerification>,
      roleRepository as unknown as Repository<Role>,
      { queueWelcomeEmail: jest.fn() } as never,
      { get: (_k: string, d?: unknown) => d } as unknown as ConfigService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger
    )
    return { service, userRepository }
  }

  it("assigns the 'user' role resolved by name", async () => {
    const { service, userRepository } = build(9)

    await service.register(dto as never)

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ primaryRoleId: 9 })
    )
  })
})
