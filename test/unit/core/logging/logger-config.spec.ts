/**
 * What request logs record: never a token or secret from the query string, and no line per
 * health probe (probes hit /api/health every few seconds).
 */
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

import { createLoggerConfig } from '@core/config/logger.config'

const config = { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService

describe('request logging', () => {
  const pinoHttp = createLoggerConfig(config).pinoHttp as unknown as {
    serializers: { req: (req: Request) => Record<string, unknown> }
    autoLogging: { ignore: (req: Request) => boolean }
  }

  it('masks secrets in the query string', () => {
    const logged = pinoHttp.serializers.req({
      method: 'GET',
      url: '/api/v1/x?token=abc123&page=2',
      originalUrl: '/api/v1/x?token=abc123&page=2',
      path: '/api/v1/x',
      query: { token: 'abc123', page: '2', apiKey: 'k-1' },
      params: {},
      headers: {},
      socket: {}
    } as unknown as Request)

    expect(JSON.stringify(logged)).not.toContain('abc123')
    expect(JSON.stringify(logged)).not.toContain('k-1')
    expect(logged.query).toEqual({ token: '[REDACTED]', page: '2', apiKey: '[REDACTED]' })
  })

  it('does not log health probes', () => {
    expect(pinoHttp.autoLogging.ignore({ url: '/api/health/ready' } as Request)).toBe(true)
    expect(pinoHttp.autoLogging.ignore({ url: '/api/v1/stories' } as Request)).toBe(false)
  })
})
