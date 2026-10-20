import { isListedInRange } from '@modules/auth/services/password-strength.service'

describe('Have I Been Pwned range matching', () => {
  const body = [
    '0018A45C4D1DEF81644B54AB7F969B88D65:10',
    'ABCDEF0123456789ABCDEF0123456789ABC:0',
    ''
  ].join('\r\n')

  it('matches a listed suffix with a positive count', () => {
    expect(isListedInRange(body, '0018A45C4D1DEF81644B54AB7F969B88D65')).toBe(true)
  })

  it('ignores padding lines (count 0) and absent suffixes', () => {
    expect(isListedInRange(body, 'ABCDEF0123456789ABCDEF0123456789ABC')).toBe(false)
    expect(isListedInRange(body, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(false)
  })
})
