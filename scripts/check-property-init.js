#!/usr/bin/env node
/**
 * strictPropertyInitialization for everything except TypeORM entities and DTOs.
 *
 * The flag is off in tsconfig because entities and class-validator/class-transformer
 * DTOs are populated by the framework. Every other class must still initialize its
 * fields, so this runs the compiler with the flag on and fails on anything outside
 * entity and DTO files.
 */
const { spawnSync } = require('child_process')

const EXEMPT = [/\.entity\.ts\(/, /\/dto\//]

const result = spawnSync(
  'npx',
  [
    'tsc',
    '--noEmit',
    '--incremental',
    'false',
    '-p',
    'tsconfig.json',
    '--strictPropertyInitialization',
    '--pretty',
    'false'
  ],
  { encoding: 'utf8' }
)
const errors = (result.stdout + result.stderr).split('\n').filter(line => line.includes('error TS'))
const offending = errors.filter(line => !EXEMPT.some(re => re.test(line)))

if (offending.length > 0) {
  console.error('Uninitialized class fields outside entities and DTOs:\n')
  console.error(offending.join('\n'))
  process.exit(1)
}
console.log(`ok: no uninitialized fields outside entities/DTOs (${errors.length} exempt)`)
