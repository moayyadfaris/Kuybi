/** Query keys whose values are secrets (tokens, keys, codes, passwords) */
const SENSITIVE_KEY = /token|secret|password|api[-_]?key|signature|^code$|^key$|^auth/i

/**
 * A request's query for logs and error reports, with the values of sensitive keys
 * replaced: links such as /reset?token=... must not leave their token behind.
 */
export function redactQuery(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== 'object') return {}
  return Object.fromEntries(
    Object.entries(query as Record<string, unknown>).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : value
    ])
  )
}

/** The path of a URL, without its query string */
export function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0]
}

/** An email address for logs: the first letter and the domain ("a***@example.com") */
export function maskEmail(email: string | undefined | null): string {
  const at = email?.lastIndexOf('@') ?? -1
  if (!email || at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}
