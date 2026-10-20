import { PinoLogger } from 'nestjs-pino'

import { S3Service } from '@modules/attachments/services/s3.service'

/** Signs locally with dummy credentials (no network) and inspects the policy S3 enforces */
describe('S3Service.createPresignedUpload', () => {
  const config: Record<string, string> = {
    's3.region': 'eu-west-1',
    's3.bucket': 'kuybi-test-bucket',
    's3.accessKeyId': 'AKIAIOSFODNN7EXAMPLE',
    's3.secretAccessKey': 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  }
  const s3 = new S3Service(
    { get: (key: string, fallback?: unknown) => config[key] ?? fallback } as never,
    {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn()
    } as unknown as PinoLogger
  )

  it('pins key, exact size and Content-Type, and grants no ACL', async () => {
    const { url, fields } = await s3.createPresignedUpload({
      key: 'uploads/u1/photo.png',
      contentType: 'image/png',
      size: 1234,
      expiresInSeconds: 900
    })

    expect(url).toContain('kuybi-test-bucket')
    expect(fields).toMatchObject({ key: 'uploads/u1/photo.png', 'Content-Type': 'image/png' })
    expect(fields.acl).toBeUndefined()

    const policy = JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8'))
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1234, 1234],
        ['eq', '$Content-Type', 'image/png'],
        { key: 'uploads/u1/photo.png' }
      ])
    )
    const expiresInMs = new Date(policy.expiration).getTime() - Date.now()
    expect(expiresInMs).toBeGreaterThan(14 * 60 * 1000)
    expect(expiresInMs).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('builds keys from client input without extra path segments or odd extensions', () => {
    const key = s3.generateKey('u1', 'report.p hp', '../profile/u2')
    const [category, owner] = key.split('/')

    expect(category).toBe('-profile-u2')
    expect(owner).toBe('u1')
    expect(key.split('/')).toHaveLength(6)
    expect(key).toMatch(/\/\d+-[0-9a-f-]{36}\.bin$/)
    expect(s3.generateKey('u1', 'photo.JPG')).toMatch(/^uploads\/u1\/.+\.jpg$/)
  })
})
