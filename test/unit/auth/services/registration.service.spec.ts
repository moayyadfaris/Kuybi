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
    // Stands in for the transaction's EntityManager
    const manager = {
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn(async (data: object) => ({ ...data, id: 'saved-1' }))
    }
    const emailQueueService = { queueWelcomeEmail: jest.fn() }
    const userRepository = {
      manager: {
        transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager))
      },
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
      emailQueueService as never,
      { get: (_k: string, d?: unknown) => d } as unknown as ConfigService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger
    )
    return { service, userRepository, manager, emailQueueService }
  }

  it("assigns the 'user' role resolved by name", async () => {
    const { service, userRepository } = build(9)

    await service.register(dto as never)

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ primaryRoleId: 9 })
    )
  })

  it('stores the user, the verification token and the welcome email in one transaction', async () => {
    const { service, userRepository, manager, emailQueueService } = build(9)

    await service.register(dto as never)

    expect(userRepository.manager.transaction).toHaveBeenCalledTimes(1)
    expect(manager.save).toHaveBeenCalledTimes(2) // user + verification token
    expect(emailQueueService.queueWelcomeEmail).toHaveBeenCalledWith(
      dto.email,
      dto.firstName,
      expect.stringContaining('/verify-email?token='),
      expect.objectContaining({ manager })
    )
  })
})
