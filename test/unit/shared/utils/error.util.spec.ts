import { errorMessage, errorProperty, errorStack } from '@shared/utils/error.util'

describe('error utils', () => {
  it('reads the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads a message property from error-like objects', () => {
    expect(errorMessage({ message: 'from object', code: 'E1' })).toBe('from object')
  })

  it('stringifies thrown non-errors', () => {
    expect(errorMessage('plain string')).toBe('plain string')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(undefined)).toBe('undefined')
  })

  it('returns the stack only for Error instances', () => {
    expect(errorStack(new Error('x'))).toContain('Error: x')
    expect(errorStack({ stack: 'fake' })).toBeUndefined()
  })

  it('reads arbitrary properties safely', () => {
    expect(errorProperty({ code: '23505' }, 'code')).toBe('23505')
    expect(errorProperty('oops', 'code')).toBeUndefined()
    expect(errorProperty(null, 'code')).toBeUndefined()
  })
})
