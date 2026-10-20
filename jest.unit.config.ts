import type { Config } from 'jest'

import baseConfig from './jest.config.ts'

/**
 * Unit tests only: no database/Redis global setup, so this runs anywhere (including CI)
 * without external services. Integration specs (*.integration.spec.ts) are excluded.
 */
const config: Config = {
  ...baseConfig,
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$', '/test/performance/'],
  globalSetup: undefined,
  globalTeardown: undefined,
  testSequencer: undefined
}

export default config
