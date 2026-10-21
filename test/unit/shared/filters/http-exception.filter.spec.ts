import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ErrorCode } from '@shared/errors'
import { HttpExceptionFilter } from '@shared/filters/http-exception.filter'
import { PinoLogger } from 'nestjs-pino'

describe('HttpExceptionFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn() }
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback)
    }) as unknown as ConfigService

  const run = (
    exception: unknown,
    values: Record<string, unknown> = {},
    reporter?: jest.Mock,
    url = '/api/v1/x'
  ) => {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          id: 'req-1',
          method: 'GET',
          url,
          originalUrl: url,
          query: Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? '')),
          body: {}
        })
      })
    } as unknown as ArgumentsHost
    new HttpExceptionFilter(logger as unknown as PinoLogger, config(values), reporter).catch(
      exception,
      host
    )
    return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] }
  }

  beforeEach(() => jest.clearAllMocks())

  describe('server errors', () => {
    const boom = new Error('relation "users" does not exist at /srv/app/x.ts')

    it('drops a structured 5xx body unless details are exposed', () => {
      const { body } = run(
        new ServiceUnavailableException({ message: 'pg at 10.0.0.5 refused', host: '10.0.0.5' })
      )

      expect(body.error).toEqual({ code: 'SERVICE_UNAVAILABLE', message: 'Service Unavailable' })
    })

    it('passes only the public health fields of a 5xx body, never its message', () => {
      const { body } = run(
        new ServiceUnavailableException({
          message: 'internal db password=SENSITIVE',
          details: { database: { status: 'down' } },
          privateContext: 'SENSITIVE',
          stack: 'at /srv/app'
        })
      )

      expect(body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service Unavailable',
        details: { database: { status: 'down' } }
      })
      expect(JSON.stringify(body)).not.toContain('SENSITIVE')
    })

    it('keeps query secrets out of the logs and the response path', () => {
      const { body } = run(
        new BadRequestException('nope'),
        {},
        undefined,
        '/api/v1/x?token=SECRET&page=2'
      )

      const logged = JSON.stringify(logger.warn.mock.calls)
      expect(logged).not.toContain('SECRET')
      expect(logged).toContain('page')
      expect(body.path).toBe('/api/v1/x')
    })

    it('hides the message and stack unless details are explicitly exposed', () => {
      // No config at all = production behaviour
      const { status, body } = run(boom)

      expect(status).toBe(500)
      expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal Server Error' })
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: boom.message, stack: boom.stack }),
        expect.any(String)
      )
    })

    it('shows the message and stack when details are exposed (development/test)', () => {
      const { body } = run(boom, { 'http.exposeErrorDetails': true })

      expect(body.error.message).toBe(boom.message)
      expect(body.error.stack).toBe(boom.stack)
    })

    it('reports each server error once', () => {
      const reporter = jest.fn()
      run(boom, {}, reporter)

      expect(reporter).toHaveBeenCalledTimes(1)
      expect(reporter).toHaveBeenCalledWith(boom, expect.objectContaining({ id: 'req-1' }), 500)
    })

    it('still answers when the reporter throws', () => {
      const reporter = jest.fn(() => {
        throw new Error('sentry down')
      })

      expect(run(boom, {}, reporter).status).toBe(500)
    })

    it('passes health check details through', () => {
      const { status, body } = run(
        new ServiceUnavailableException({
          status: 'error',
          error: { database: { status: 'down' } },
          details: { database: { status: 'down' } }
        })
      )

      expect(status).toBe(503)
      expect(body.error.details).toEqual({ database: { status: 'down' } })
    })
  })

  describe('client errors', () => {
    it('returns the message and validation details in every environment', () => {
      const { status, body } = run(new BadRequestException(['email must be an email']))

      expect(status).toBe(400)
      expect(body).toMatchObject({ success: false, statusCode: 400, requestId: 'req-1' })
      expect(body.error.message).toEqual(['email must be an email'])
      expect(body.error.stack).toBeUndefined()
    })

    it('passes structured client error bodies through (e.g. field errors)', () => {
      const errors = [{ fieldName: 'price', message: 'price must be positive' }]
      const { body } = run(new BadRequestException({ message: 'Field validation failed', errors }))

      expect(body.error).toMatchObject({ message: 'Field validation failed', errors })
    })

    it('is logged as a warning and not reported', () => {
      const reporter = jest.fn()
      run(new NotFoundException('Story 9 not found'), {}, reporter)

      expect(logger.warn).toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
      expect(reporter).not.toHaveBeenCalled()
    })
  })

  describe('error codes', () => {
    const code = (exception: unknown) => run(exception).body.error.code

    it('gives every error the generic code of its status', () => {
      expect(code(new NotFoundException('Story with ID 1 not found'))).toBe(ErrorCode.NOT_FOUND)
      expect(code(new ConflictException('Email taken'))).toBe(ErrorCode.CONFLICT)
      expect(code(new UnauthorizedException())).toBe(ErrorCode.UNAUTHORIZED)
      expect(code(new HttpException('Locked', 423))).toBe(ErrorCode.LOCKED)
      expect(code(new HttpException('Teapot', 418))).toBe(ErrorCode.BAD_REQUEST)
      expect(code(new Error('boom'))).toBe(ErrorCode.INTERNAL_ERROR)
    })

    it('marks validation failures (a list of messages)', () => {
      const validation = new BadRequestException({
        message: ['email must be an email'],
        error: 'Bad Request',
        statusCode: 400
      })
      expect(code(validation)).toBe(ErrorCode.VALIDATION_FAILED)
      expect(code(new BadRequestException('Tags not found: 9'))).toBe(ErrorCode.BAD_REQUEST)
    })

    it('keeps a known code set by the throw site', () => {
      const expired = new UnauthorizedException({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'Access token expired'
      })
      expect(run(expired).body.error).toMatchObject({
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        message: 'Access token expired'
      })
    })

    it('ignores unknown codes, and any code on a server error', () => {
      expect(code(new BadRequestException({ code: 'MADE_UP', message: 'x' }))).toBe(
        ErrorCode.BAD_REQUEST
      )
      expect(
        code(new InternalServerErrorException({ code: ErrorCode.AUTH_TOKEN_EXPIRED, message: 'x' }))
      ).toBe(ErrorCode.INTERNAL_ERROR)
      expect(
        run(new InternalServerErrorException({ code: ErrorCode.CONFLICT }), {
          'http.exposeErrorDetails': true
        }).body.error.code
      ).toBe(ErrorCode.INTERNAL_ERROR)
    })
  })
})
