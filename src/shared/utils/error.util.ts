/**
 * Helpers for reading caught values. With useUnknownInCatchVariables, a catch variable is
 * `unknown`: anything can be thrown, not only Error instances.
 */

/** Message of a caught value, or its string form when it is not an Error. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/** Stack trace of a caught value, if it has one. */
export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

/** A property such as `code` or `status` from a caught value, if present. */
export function errorProperty<T = unknown>(error: unknown, key: string): T | undefined {
  return typeof error === 'object' && error !== null && key in error
    ? ((error as Record<string, unknown>)[key] as T)
    : undefined
}
