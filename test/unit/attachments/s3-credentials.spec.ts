/**
 * S3 credentials: the keys from config when both are set (with a session token for
 * temporary credentials), otherwise the AWS default chain (environment, shared profile,
 * IAM role of the instance or task). Requiring static keys blocked role-based deployments.
 */
import { PinoLogger } from 'nestjs-pino'

import { S3Service } from '@modules/attachments/services/s3.service'

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as unknown as PinoLogger

const build = (settings: Record<string, string | undefined>) =>
  new S3Service(
    {
      get: (key: string, fallback?: unknown) =>
        ({ 's3.bucket': 'bucket', 's3.region': 'eu-west-1', ...settings })[key] ?? fallback
    } as never,
    logger
  )
const credentialsOf = async (s3: S3Service) =>
  (s3 as unknown as { s3Client: { config: { credentials: () => Promise<unknown> } } }).s3Client
    .config.credentials

describe('S3Service credentials', () => {
  it('starts without static keys, using the AWS default credential chain', () => {
    expect(() => build({})).not.toThrow()
  })

  it('uses the configured keys, with a session token for temporary credentials', async () => {
    const s3 = build({
      's3.accessKeyId': 'AKIA-TEST',
      's3.secretAccessKey': 'secret',
      's3.sessionToken': 'session'
    })
    const provider = await credentialsOf(s3)
    await expect(provider()).resolves.toMatchObject({
      accessKeyId: 'AKIA-TEST',
      secretAccessKey: 'secret',
      sessionToken: 'session'
    })
  })

  it('refuses half a key pair', () => {
    expect(() => build({ 's3.accessKeyId': 'AKIA-TEST' })).toThrow(/S3_SECRET/)
  })
})
