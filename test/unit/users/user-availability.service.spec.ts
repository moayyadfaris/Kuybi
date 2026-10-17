import { PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'

import { User } from '@modules/users/entities/user.entity'
import { UserAvailabilityService } from '@modules/users/services/user-availability.service'

import { CacheService } from '@core/cache/services/cache.service'

describe('UserAvailabilityService', () => {
  const build = (cached: boolean | undefined, existsInDb: boolean) => {
    const userRepository = { exists: jest.fn().mockResolvedValue(existsInDb) }
    // CacheService.get resolves undefined on a cache miss
    const cacheService = { get: jest.fn().mockResolvedValue(cached), set: jest.fn() }
    const service = new UserAvailabilityService(
      userRepository as unknown as Repository<User>,
      cacheService as unknown as CacheService,
      { debug: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as PinoLogger
    )
    return { service, userRepository, cacheService }
  }

  describe.each([
    ['email', 'isEmailAvailable', 'new@example.com'],
    ['phone', 'isPhoneAvailable', '+962790000000']
  ] as const)('%s', (_label, method, value) => {
    it('checks the database on a cache miss and reports availability', async () => {
      const { service, userRepository } = build(undefined, false)

      const result = await service[method](value)

      expect(userRepository.exists).toHaveBeenCalled()
      expect(result.available).toBe(true)
    })

    it('reports taken values from the database on a cache miss', async () => {
      const { service } = build(undefined, true)

      expect((await service[method](value)).available).toBe(false)
    })

    it('uses a cached answer without querying the database', async () => {
      const { service, userRepository } = build(false, true)

      expect((await service[method](value)).available).toBe(false)
      expect(userRepository.exists).not.toHaveBeenCalled()
    })
  })
})
