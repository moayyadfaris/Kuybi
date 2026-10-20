import { UserRepository } from '@modules/users/repositories/user.repository'
import { UserAvailabilityService } from '@modules/users/services/user-availability.service'

describe('UserAvailabilityService', () => {
  const build = (taken: boolean) => {
    const userRepository = {
      isEmailTaken: jest.fn().mockResolvedValue(taken),
      isMobileTaken: jest.fn().mockResolvedValue(taken)
    }
    const service = new UserAvailabilityService(userRepository as unknown as UserRepository)
    return { service, userRepository }
  }

  it('normalises the email before looking it up', async () => {
    const { service, userRepository } = build(false)

    const result = await service.isEmailAvailable('  New@Example.com ')

    expect(userRepository.isEmailTaken).toHaveBeenCalledWith('new@example.com')
    expect(result).toEqual({ available: true, field: 'email', value: 'new@example.com' })
  })

  it('suggests alternatives for a taken email', async () => {
    const { service } = build(true)

    const result = await service.isEmailAvailable('taken@example.com')

    expect(result.available).toBe(false)
    expect(result.suggestions?.length).toBeGreaterThan(0)
  })

  it('strips formatting from phone numbers', async () => {
    const { service, userRepository } = build(true)

    const result = await service.isPhoneAvailable('+962 79-000 (0000)')

    expect(userRepository.isMobileTaken).toHaveBeenCalledWith('+962790000000')
    expect(result.available).toBe(false)
  })
})
