import { issuedBefore } from '@modules/auth/strategies/jwt.strategy'

describe('issuedBefore (tokens older than a password reset)', () => {
  const changedAt = new Date('2026-10-21T10:00:00.700Z')
  const second = Math.floor(changedAt.getTime() / 1000)

  it('voids tokens issued in an earlier second', () => {
    expect(issuedBefore(second - 1, changedAt)).toBe(true)
  })

  it('accepts tokens of the same or a later second (iat has whole seconds)', () => {
    expect(issuedBefore(second, changedAt)).toBe(false)
    expect(issuedBefore(second + 1, changedAt)).toBe(false)
  })

  it('accepts everything when the password was never reset', () => {
    expect(issuedBefore(second - 100, null)).toBe(false)
  })
})
