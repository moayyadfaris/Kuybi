import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import configuration from '@core/config/configuration'

/**
 * Every key the code reads with configService.get('a.b') exists in configuration().
 * A key that does not exist returns the call's fallback forever, and its environment
 * variable does nothing: compression and the per-user session limit went unnoticed
 * that way.
 */
describe('configuration keys read by the code', () => {
  // Read from the environment by ConfigService, or present only when set (secrets)
  const OPTIONAL = new Set([
    'NODE_ENV',
    'auth.jwtSecret',
    'redis.password',
    's3.accessKeyId',
    's3.secretAccessKey',
    's3.sessionToken'
  ])
  const KEY = /\b(?:configService|config)\.(?:get|getOrThrow)(?:<[^>]+>)?\(\s*'([^']+)'/g

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return path.endsWith('.ts') ? [path] : []
    })

  it('defines every key', () => {
    const config = configuration() as Record<string, unknown>
    const read = new Set(
      sources(join(__dirname, '../../../../src')).flatMap(file =>
        [...readFileSync(file, 'utf8').matchAll(KEY)].map(match => match[1])
      )
    )
    const missing = [...read].filter(
      key =>
        !OPTIONAL.has(key) &&
        key
          .split('.')
          .reduce<unknown>(
            (node, part) =>
              node && typeof node === 'object'
                ? (node as Record<string, unknown>)[part]
                : undefined,
            config
          ) === undefined
    )

    expect(read.size).toBeGreaterThan(40)
    expect(missing).toEqual([])
  })
})
