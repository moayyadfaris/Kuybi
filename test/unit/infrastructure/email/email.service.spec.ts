import { ConfigService } from '@nestjs/config'
import { EmailService } from '@infrastructure/email/services/email.service'
import { PinoLogger } from 'nestjs-pino'
import * as nodemailer from 'nodemailer'

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }))

describe('EmailService', () => {
  const createTransport = nodemailer.createTransport as jest.Mock
  const transport = { verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn() }
  const templates = {
    render: jest.fn().mockResolvedValue('<p>hi</p>'),
    preloadTemplates: jest.fn()
  }
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

  const start = async (config: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      'email.smtp.host': 'smtp.example.com',
      'email.smtp.port': 587,
      'email.smtp.secure': false,
      ...config
    }
    const configService = {
      get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback)
    } as unknown as ConfigService
    const service = new EmailService(
      configService,
      templates as never,
      logger as unknown as PinoLogger
    )
    await service.onModuleInit()
    return service
  }
  const transportOptions = () => createTransport.mock.calls.at(-1)![0]

  beforeEach(() => {
    jest.clearAllMocks()
    createTransport.mockReturnValue(transport)
  })

  describe('transport security', () => {
    it('requires STARTTLS on a plain port, so a stripped upgrade cannot send in clear text', async () => {
      await start()
      expect(transportOptions()).toMatchObject({ secure: false, requireTLS: true })
    })

    it('verifies the certificate, also for an IP address host', async () => {
      await start({ 'email.smtp.host': '203.0.113.10' })
      const options = transportOptions()
      expect(options.tls?.rejectUnauthorized).not.toBe(false)
      expect(options.tls?.servername).toBeUndefined()
    })

    it('relaxes TLS only when configured (local mail catchers)', async () => {
      await start({
        'email.smtp.requireTls': false,
        'email.smtp.tlsRejectUnauthorized': false
      })
      expect(transportOptions()).toMatchObject({
        requireTLS: false,
        tls: { rejectUnauthorized: false }
      })
    })
  })
})
