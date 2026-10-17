import { redactSensitive } from '@modules/audit/interceptors/audit-redaction'

describe('redactSensitive', () => {
  it('redacts sensitive keys at any depth', () => {
    expect(
      redactSensitive({
        email: 'a@b.c',
        password: 'p',
        user: { name: 'n', currentPassword: 'x', nested: { refreshToken: 't' } }
      })
    ).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
      user: { name: 'n', currentPassword: '[REDACTED]', nested: { refreshToken: '[REDACTED]' } }
    })
  })

  it('redacts tokens inside response envelopes and arrays', () => {
    expect(
      redactSensitive({ data: { accessToken: 'a', sessions: [{ id: 1, apiKey: 'k' }] } })
    ).toEqual({ data: { accessToken: '[REDACTED]', sessions: [{ id: 1, apiKey: '[REDACTED]' }] } })
  })

  it('matches keys case-insensitively', () => {
    expect(redactSensitive({ Authorization: 'Bearer x', PASSWORD: 'p' })).toEqual({
      Authorization: '[REDACTED]',
      PASSWORD: '[REDACTED]'
    })
  })

  it('leaves primitives and non-sensitive values alone', () => {
    expect(redactSensitive('text')).toBe('text')
    expect(redactSensitive(null)).toBeNull()
    expect(redactSensitive({ count: 3, tags: ['a'] })).toEqual({ count: 3, tags: ['a'] })
  })

  it('stops at a maximum depth instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(() => redactSensitive(cyclic)).not.toThrow()
  })
})
