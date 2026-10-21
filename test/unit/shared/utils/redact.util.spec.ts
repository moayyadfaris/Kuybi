import { maskEmail } from '@shared/utils/redact.util'

describe('maskEmail', () => {
  it.each([
    ['ann.lee@example.com', 'a***@example.com'],
    ['A@example.com', 'A***@example.com'],
    ['not-an-email', '***'],
    [undefined, '***']
  ])('%j -> %j', (input, expected) => {
    expect(maskEmail(input)).toBe(expected)
  })
})
