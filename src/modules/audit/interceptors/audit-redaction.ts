/**
 * Redaction for values written to audit logs (request bodies and responses).
 *
 * Applied recursively: login and refresh responses carry tokens inside the response
 * envelope, and request bodies can nest credentials.
 */
const SENSITIVE_KEYS = new Set(
  [
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'tempAccessToken',
    'authorization',
    'secret',
    'apiKey',
    'creditCard',
    'cvv'
  ].map(key => key.toLowerCase())
)
const MAX_DEPTH = 10
const REDACTED = '[REDACTED]'

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (depth >= MAX_DEPTH) {
    return '[MAX_DEPTH]'
  }
  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, depth + 1))
  }
  if (value instanceof Date) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redactSensitive(item, depth + 1)
    ])
  )
}
