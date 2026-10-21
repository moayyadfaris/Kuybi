import { credentialsOutdated } from '@modules/auth/strategies/jwt.strategy'

/**
 * A06: tokens are tied to the credentials version they were issued under, not to a
 * time. Before, a token issued earlier in the same second as a password reset passed
 * the whole-second iat comparison.
 */
describe('credentialsOutdated (tokens issued before a password reset)', () => {
  it('voids a token issued under an earlier version, whenever it was issued', () => {
    expect(credentialsOutdated(0, 1)).toBe(true)
    expect(credentialsOutdated(3, 4)).toBe(true)
  })

  it('accepts a token issued under the current version', () => {
    expect(credentialsOutdated(2, 2)).toBe(false)
  })

  it('treats a token without the claim as version 0 (issued before the claim existed)', () => {
    expect(credentialsOutdated(undefined, 0)).toBe(false)
    expect(credentialsOutdated(undefined, 1)).toBe(true)
  })
})
