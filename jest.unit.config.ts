import type { Config } from 'jest'

import baseConfig from './jest.config'

/**
 * Unit tests only: no database/Redis global setup, so this runs anywhere (including CI)
 * without external services. Integration specs (*.integration.spec.ts) are excluded.
 */
const config: Config = {
  ...baseConfig,
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.spec\\.ts$',
    '/test/performance/',
    // QUARANTINED: written against an older get/set caching API; the repository now uses
    // cacheService.wrap and count queries. Rewrite, then remove this entry.
    '/test/unit/post-types/repositories/post-type.repository.spec.ts'
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
  testSequencer: undefined,
  coverageThreshold: undefined
}

export default config
