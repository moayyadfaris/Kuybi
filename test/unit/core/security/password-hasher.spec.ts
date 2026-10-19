import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'

import { hashTokenSecret, PasswordHasher, verifyTokenSecret } from '@core/security'

jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt')
  return { ...actual, compare: jest.fn(actual.compare) }
})

const hasher = (rounds?: number) =>
  new PasswordHasher({ get: () => rounds } as unknown as ConfigService)

describe('PasswordHasher', () => {
  it('hashes at the configured cost, 12 by default', async () => {
    expect(hasher().rounds).toBe(12)
    const hash = await hasher(5).hash('Correct-horse-1')
    expect(bcrypt.getRounds(hash)).toBe(5)
    expect(await hasher(5).verify('Correct-horse-1', hash)).toBe(true)
    expect(await hasher(5).verify('wrong', hash)).toBe(false)
  })

  it('refuses a new password bcrypt would truncate (over 72 bytes)', async () => {
    await expect(hasher(4).hash('a'.repeat(72))).resolves.toMatch(/^\$2/)
    await expect(hasher(4).hash('a'.repeat(73))).rejects.toBeInstanceOf(BadRequestException)
    // 37 accented letters are 74 bytes
    await expect(hasher(4).hash('é'.repeat(37))).rejects.toBeInstanceOf(BadRequestException)
  })

  it('still spends the hashing time when there is no stored hash', async () => {
    const compare = jest.mocked(bcrypt.compare)
    compare.mockClear()
    expect(await hasher(4).verify('anything', null)).toBe(false)
    expect(compare).toHaveBeenCalledTimes(1)
  })

  it('asks for a rehash only below the configured cost', async () => {
    const weak = await bcrypt.hash('pw', 4)
    expect(hasher(5).needsRehash(weak)).toBe(true)
    expect(hasher(4).needsRehash(weak)).toBe(false)
    expect(hasher(5).needsRehash('not-a-bcrypt-hash')).toBe(false)
  })
})

describe('token secret hashing', () => {
  it('verifies SHA-256 hashes and the bcrypt hashes stored before them', async () => {
    const stored = hashTokenSecret('secret-1')
    expect(stored).toMatch(/^sha256\$[0-9a-f]{64}$/)
    expect(await verifyTokenSecret('secret-1', stored)).toBe(true)
    expect(await verifyTokenSecret('secret-2', stored)).toBe(false)

    const legacy = await bcrypt.hash('secret-1', 4)
    expect(await verifyTokenSecret('secret-1', legacy)).toBe(true)
    expect(await verifyTokenSecret('secret-2', legacy)).toBe(false)
  })
})
