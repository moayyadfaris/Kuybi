import { clientIp, parseTrustProxy, parseUserAgent, requestIdOf } from '@shared/utils/request.util'
import type { Request } from 'express'

describe('request utils', () => {
  describe('parseTrustProxy', () => {
    it.each([
      [undefined, false],
      ['', false],
      ['false', false],
      ['true', true],
      ['1', 1],
      ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8']
    ])('%s -> %s', (input, expected) => {
      expect(parseTrustProxy(input)).toEqual(expected)
    })
  })

  it('takes the client IP from req.ip, never from forwarding headers', () => {
    const req = {
      ip: '203.0.113.7',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '10.0.0.1' }
    } as unknown as Request

    expect(clientIp(req)).toBe('203.0.113.7')
  })

  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
      { browser: 'Edge', os: 'Windows', type: 'desktop' }
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 OPR/105.0',
      { browser: 'Opera', os: 'macOS', type: 'desktop' }
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS', type: 'mobile' }
    ],
    ['curl/8.4.0', { browser: 'cURL', os: 'unknown', type: 'desktop' }]
  ])('parses %s', (ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected)
  })
})

describe('requestIdOf', () => {
  const req = (header?: string) =>
    ({ headers: header === undefined ? {} : { 'x-request-id': header } }) as unknown as Request

  it("keeps a client's plausible id", () => {
    expect(requestIdOf(req('trace-0123456789'))).toBe('trace-0123456789')
  })

  it.each(['short', 'r'.repeat(101), 'has spaces in it', 'line\nbreak-injected'])(
    'replaces %j with a new UUID',
    header => {
      expect(requestIdOf(req(header))).toMatch(/^[0-9a-f-]{36}$/)
    }
  )

  it('assigns once: every reader of the request gets the same id', () => {
    const request = req()
    const id = requestIdOf(request)

    expect(requestIdOf(request)).toBe(id)
    expect(request.id).toBe(id)
    expect(request.requestId).toBe(id)
  })
})
