import { ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'

import { RoleRepository } from '@modules/acl/repositories/role.repository'
import { RegistrationService } from '@modules/auth/services/registration.service'
import { User } from '@modules/users/entities/user.entity'
import { EmailVerificationRepository } from '@modules/users/repositories/email-verification.repository'
import { UserRepository } from '@modules/users/repositories/user.repository'

import { PasswordHasher } from '@core/security'

describe('RegistrationService.register', () => {
  const dto = {
    email: 'new@example.com',
    password: 'Str0ng!Passw0rd',
    firstName: 'New',
    lastName: 'User'
  }

  const build = (userRoleId: number, emailTaken = false) => {
    // Stands in for the transaction's EntityManager
    const manager = {
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn(async (data: object) => ({ ...data, id: 'saved-1' }))
    }
    const emailQueueService = { queueWelcomeEmail: jest.fn() }
    const userRepository = {
      // UserRepository.transaction invalidates the user caches after the commit
      transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)),
      isEmailTaken: jest.fn().mockResolvedValue(emailTaken),
      isMobileTaken: jest.fn().mockResolvedValue(false)
    }
    const roleRepository = { findDefaultRoleId: jest.fn().mockResolvedValue(userRoleId) }
    const service = new RegistrationService(
      new PasswordHasher({ get: () => 4 } as unknown as ConfigService),
      userRepository as unknown as UserRepository,
      {} as EmailVerificationRepository,
      roleRepository as unknown as RoleRepository,
      emailQueueService as never,
      { get: (_k: string, d?: unknown) => d } as unknown as ConfigService,
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger
    )
    return { service, userRepository, manager, emailQueueService }
  }

  it("assigns the 'user' role resolved by name", async () => {
    const { service, manager } = build(9)

    await service.register(dto as never)

    expect(manager.create).toHaveBeenCalledWith(User, expect.objectContaining({ primaryRoleId: 9 }))
  })

  it('stores the email lowercased (login looks it up lowercased)', async () => {
    const { service, manager, userRepository } = build(9)

    await service.register({ ...dto, email: '  New.User@Example.COM ' } as never)

    expect(userRepository.isEmailTaken).toHaveBeenCalledWith('new.user@example.com')
    expect(manager.create).toHaveBeenCalledWith(
      User,
      expect.objectContaining({ email: 'new.user@example.com' })
    )
  })

  it('rejects an email that is already registered, whatever its case', async () => {
    const { service, userRepository } = build(9, true)

    await expect(service.register({ ...dto, email: 'NEW@example.com' } as never)).rejects.toThrow(
      ConflictException
    )
    expect(userRepository.transaction).not.toHaveBeenCalled()
  })

  it('stores the user, the verification token and the welcome email in one transaction', async () => {
    const { service, userRepository, manager, emailQueueService } = build(9)

    await service.register(dto as never)

    expect(userRepository.transaction).toHaveBeenCalledTimes(1)
    expect(manager.save).toHaveBeenCalledTimes(2) // user + verification token
    expect(emailQueueService.queueWelcomeEmail).toHaveBeenCalledWith(
      dto.email,
      dto.firstName,
      expect.stringContaining('/verify-email?token='),
      expect.objectContaining({ manager })
    )
  })
})
