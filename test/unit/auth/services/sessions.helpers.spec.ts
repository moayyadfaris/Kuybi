import {
  detectDeviceType,
  deviceFingerprint,
  isPrivateIpv4
} from '@modules/auth/services/sessions.service'

describe('session helpers', () => {
  it('recognises RFC 1918 addresses only', () => {
    expect(['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1'].map(isPrivateIpv4)).toEqual([
      true,
      true,
      true,
      true
    ])
    // 172.217.x is Google, not a private network
    expect(
      ['172.217.3.110', '172.15.0.1', '8.8.8.8', '::1', 'nonsense'].map(isPrivateIpv4)
    ).toEqual([false, false, false, false, false])
  })

  it('detects the device class, tablets before phones', () => {
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    expect(detectDeviceType(ipad)).toBe('tablet')
    expect(detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')).toBe('mobile')
    expect(detectDeviceType('curl/8.4.0')).toBe('api-client')
    expect(detectDeviceType('Googlebot/2.1')).toBe('bot')
    expect(detectDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('desktop')
    expect(detectDeviceType(undefined)).toBe('unknown')
  })

  it('fingerprints a device the same way every time, without revealing its address', () => {
    const a = deviceFingerprint('203.0.113.7', 'Safari')
    expect(a).toBe(deviceFingerprint('203.0.113.7', 'Safari'))
    expect(a).not.toBe(deviceFingerprint('203.0.113.8', 'Safari'))
    expect(a).toMatch(/^fp_[0-9a-f]{32}$/)
    expect(a).not.toContain(Buffer.from('203.0.113.7').toString('base64').slice(0, 8))
  })
})
