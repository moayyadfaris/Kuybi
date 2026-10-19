#!/usr/bin/env node
/**
 * Coverage gate across unit + integration tests.
 *
 * Most behaviour is exercised by integration tests, so neither suite alone gives a
 * meaningful number. This merges coverage/unit and coverage/integration and fails if the
 * combined coverage drops below the floor.
 *
 * The floor is a ratchet: raise it when coverage improves, never lower it to make CI pass.
 */
const fs = require('fs')
const path = require('path')
const { createCoverageMap } = require('istanbul-lib-coverage')

// About 2 points under the measurement on 2026-10-19 (lines 66.2, statements 66.7,
// branches 50.8, functions 58.9). Raise it as coverage grows; never lower it to pass.
const FLOOR = { lines: 66, statements: 66, branches: 51, functions: 60 }
const SOURCES = ['coverage/unit/coverage-final.json', 'coverage/integration/coverage-final.json']

const map = createCoverageMap({})
for (const source of SOURCES) {
  const file = path.resolve(__dirname, '..', source)
  if (!fs.existsSync(file)) {
    console.error(
      `Missing ${source}. Run "npm run test:unit:cov" and "npm run test:integration:cov" first.`
    )
    process.exit(1)
  }
  map.merge(JSON.parse(fs.readFileSync(file, 'utf8')))
}

const summary = map.getCoverageSummary().toJSON()
let failed = false
for (const [metric, floor] of Object.entries(FLOOR)) {
  const pct = summary[metric].pct
  const ok = pct >= floor
  failed ||= !ok
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${metric.padEnd(10)} ${String(pct).padStart(6)}%  (floor ${floor}%)`
  )
}

if (failed) {
  console.error('\nCombined coverage is below the floor.')
  process.exit(1)
}
