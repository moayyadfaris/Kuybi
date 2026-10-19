import { clientIp, parseTrustProxy, parseUserAgent } from '@shared/utils/request.util'
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
