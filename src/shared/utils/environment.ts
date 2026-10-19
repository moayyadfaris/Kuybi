/** The NODE_ENV values the app accepts; anything else fails config validation at boot. */
export const ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const

export type AppEnvironment = (typeof ENVIRONMENTS)[number]

/**
 * True only for a developer machine or the test suite. Security-relevant defaults
 * (error details, API docs, secret checks) key off this allowlist, so every other
 * environment - staging, production, or one nobody planned for - gets the strict setting.
 * Never write `env !== 'production'` for these: it fails open.
 */
export const isLocalEnvironment = (env: string | undefined): boolean =>
  env === 'development' || env === 'test'
