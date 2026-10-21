/**
 * OpenTelemetry patches a library (express, ioredis, the Redis client) only if it starts
 * before that library is loaded, and the API's imports load them. So main.ts must import
 * the tracing entry before anything else; an import sorter moving it down silently loses
 * the HTTP and Redis spans.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('main.ts', () => {
  it('imports tracing before anything else', () => {
    const source = readFileSync(join(__dirname, '../../../src/main.ts'), 'utf8')
    const firstImport = source.split('\n').find(line => line.startsWith('import '))
    expect(firstImport).toBe("import './tracing'")
  })
})
