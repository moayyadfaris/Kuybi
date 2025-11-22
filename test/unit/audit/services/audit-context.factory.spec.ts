import type { Request } from 'express'

import { AuditContextFactory } from '@modules/audit/services/audit-context.factory'

describe('AuditContextFactory', () => {
  const factory = new AuditContextFactory()

  const buildRequest = (
    overrides: Partial<Request & { user?: any; headers: Record<string, string> }> = {}
  ) => {
    const headers = Object.entries(overrides.headers ?? {}).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[key.toLowerCase()] = value
        return acc
      },
      {}
    )

    const request = {
      headers,
      protocol: 'http',
      hostname: 'localhost',
      path: '/api/test',
      query: {},
      method: 'GET',
      originalUrl: '/api/test',
      url: '/api/test',
      user: undefined,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get(this: { headers: Record<string, string> }, header: string) {
        return this.headers[header.toLowerCase()] || undefined
      },
      ...overrides
    }

    return request as unknown as Request & { user?: any }
  }

  it('extracts a context from HTTP request', () => {
    const req = buildRequest({
      headers: {
        'user-agent': 'jest',
        'x-request-id': 'req-123'
      },
      method: 'POST',
      originalUrl: '/api/example',
      user: {
        userId: 'user-1',
        email: 'john.doe@example.com'
      },
      ip: '10.0.0.1'
    })

    const context = factory.fromRequest(req)

    expect(context.userId).toBe('user-1')
    expect(context.email).toBe('john.doe@example.com')
    expect(context.username).toBe('john.doe')
    expect(context.method).toBe('POST')
    expect(context.endpoint).toBe('/api/example')
    expect(context.requestId).toBe('req-123')
    expect(context.ipAddress).toBe('10.0.0.1')
  })

  it('enriches existing context with explicit user data', () => {
    const base = factory.fromRequest(buildRequest())

    const enriched = factory.withUser(base, {
      id: 'user-2',
      email: 'jane@example.com',
      name: 'Jane'
    })

    expect(enriched.userId).toBe('user-2')
    expect(enriched.email).toBe('jane@example.com')
    expect(enriched.username).toBe('Jane')
    expect(enriched.metadata?.email).toBe('jane@example.com')
  })

  it('redacts sensitive metadata entries', () => {
    const req = buildRequest({
      query: {
        token: 'sensitive-token',
        nested: {
          password: 'super-secret',
          keep: 'visible'
        }
      } as any
    })

    const context = factory.fromRequest(req)

    expect(context.metadata?.query?.token).toBe('[REDACTED]')
    expect(context.metadata?.query?.nested?.password).toBe('[REDACTED]')
    expect(context.metadata?.query?.nested?.keep).toBe('visible')
  })
})
