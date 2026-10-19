import type { Request } from 'express'

/** Express `trust proxy` setting: false, a hop count, or trusted addresses/subnets */
export type TrustProxySetting = boolean | number | string

/**
 * Parses TRUST_PROXY. Unset or "false" trusts no proxy: X-Forwarded-For is then ignored
 * and req.ip is the socket address. Behind a load balancer set the number of proxy hops
 * ("1") or their addresses ("loopback, 10.0.0.0/8"); "true" trusts every hop, which lets
 * any client choose its IP, and is accepted only because Express accepts it.
 */
export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const raw = value?.trim()
  if (!raw || raw.toLowerCase() === 'false') return false
  if (raw.toLowerCase() === 'true') return true
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw
}

/**
 * The client's IP address. Never read X-Forwarded-For / X-Real-IP directly: any client
 * can send them. Express derives req.ip from them only through the proxies `trust proxy`
 * names (configureApp sets it from TRUST_PROXY).
 */
export function clientIp(req: Request): string | undefined {
  return req.ip || req.socket?.remoteAddress || undefined
}

export interface UserAgentInfo {
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  browser: string
  os: string
}

/** Coarse device / browser / OS from a User-Agent header, for security listings */
export function parseUserAgent(userAgent: string | undefined): UserAgentInfo {
  if (!userAgent) {
    return { type: 'unknown', browser: 'unknown', os: 'unknown' }
  }
  const ua = userAgent.toLowerCase()

  const type =
    ua.includes('tablet') || ua.includes('ipad')
      ? 'tablet'
      : ua.includes('mobile')
        ? 'mobile'
        : 'desktop'

  // Order matters: Edge and Opera user agents also contain "chrome", Chrome contains "safari"
  const browsers: Array<[string, string]> = [
    ['edg', 'Edge'],
    ['opr', 'Opera'],
    ['opera', 'Opera'],
    ['firefox', 'Firefox'],
    ['chrome', 'Chrome'],
    ['safari', 'Safari'],
    ['postman', 'Postman'],
    ['curl', 'cURL']
  ]
  const browser = browsers.find(([token]) => ua.includes(token))?.[1] ?? 'unknown'

  // iOS user agents contain "like Mac OS X", so check them before macOS
  const systems: Array<[string[], string]> = [
    [['iphone', 'ipad', 'ios'], 'iOS'],
    [['android'], 'Android'],
    [['windows'], 'Windows'],
    [['mac os', 'macos'], 'macOS'],
    [['linux'], 'Linux']
  ]
  const os = systems.find(([tokens]) => tokens.some(t => ua.includes(t)))?.[1] ?? 'unknown'

  return { type, browser, os }
}
