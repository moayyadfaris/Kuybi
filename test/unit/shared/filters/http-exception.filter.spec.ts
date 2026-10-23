import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  LoggerService,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ErrorCode, fieldError, PROBLEM_CONTENT_TYPE } from '@shared/errors'
import { HttpExceptionFilter } from '@shared/filters/http-exception.filter'

describe('HttpExceptionFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() }
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
    const response = {
      locals: {} as Record<string, unknown>,
      err: undefined as unknown,
      status: jest.fn(),
      type: jest.fn()
    }
    response.status.mockReturnValue(response)
    response.type.mockReturnValue({ json })
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
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
    new HttpExceptionFilter(logger as unknown as LoggerService, config(values), reporter).catch(
      exception,
      host
    )
    return {
      status: response.status.mock.calls[0][0],
      contentType: response.type.mock.calls[0][0],
      body: json.mock.calls[0][0],
      logged: response.locals.error as Record<string, unknown>,
      loggedError: response.err
    }
  }

  beforeEach(() => jest.clearAllMocks())

  describe('the problem (RFC 9457)', () => {
    it('answers application/problem+json with the standard members and ours', () => {
      const { status, contentType, body } = run(new NotFoundException('Story 9 not found'))

      expect(status).toBe(404)
      expect(contentType).toBe(PROBLEM_CONTENT_TYPE)
      expect(body).toEqual({
        type: 'urn:kuybi:problem:not-found',
        title: 'Not found',
        status: 404,
        detail: 'Story 9 not found',
        instance: '/api/v1/x',
        code: ErrorCode.NOT_FOUND,
        requestId: 'req-1',
        timestamp: expect.any(String)
      })
    })

    it('keeps the query string out of the instance', () => {
      expect(
        run(new NotFoundException(), {}, undefined, '/api/v1/x?token=SECRET').body.instance
      ).toBe('/api/v1/x')
    })

    it('passes field errors and details, and nothing else a throw site added', () => {
      const errors = [fieldError(['email'], 'IS_EMAIL', 'email must be an email')]
      const { body } = run(
        new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'email must be an email',
          errors,
          details: { hint: 'x' },
          internalNote: 'not for clients',
          statusCode: 400,
          error: 'Bad Request'
        })
      )

      expect(body.errors).toEqual(errors)
      expect(body.details).toEqual({ hint: 'x' })
      expect(body).not.toHaveProperty('internalNote')
      expect(body).not.toHaveProperty('error')
      expect(body.status).toBe(400)
    })

    it('drops an `errors` list that is not field errors', () => {
      const { body } = run(new BadRequestException({ message: 'x', errors: ['loose text'] }))
      expect(body).not.toHaveProperty('errors')
    })

    it('never sends a stack for a client error', () => {
      const { body } = run(new BadRequestException('nope'), { 'http.exposeErrorDetails': true })
      expect(body).not.toHaveProperty('stack')
    })
  })

  describe('server errors', () => {
    const boom = new Error('relation "users" does not exist at /srv/app/x.ts', {
      cause: new Error('connection refused 10.0.0.5')
    })

    it('hides the message, stack and causes unless details are exposed', () => {
      // No config at all = production behaviour
      const { status, body } = run(boom)

      expect(status).toBe(500)
      expect(body.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(body.detail).toMatch(/requestId/)
      expect(JSON.stringify(body)).not.toMatch(/relation|10\.0\.0\.5|srv/)
    })

    it('shows the message, stack and causes when details are exposed (development/test)', () => {
      const { body } = run(boom, { 'http.exposeErrorDetails': true })

      expect(body.detail).toBe(boom.message)
      expect(body.stack).toBe(boom.stack)
      expect(body.causes).toEqual([{ type: 'Error', message: 'connection refused 10.0.0.5' }])
    })

    it('drops a structured 5xx body, except the health results', () => {
      const { body } = run(
        new ServiceUnavailableException({
          status: 'error',
          message: 'internal db password=SENSITIVE',
          details: { database: { status: 'down' } },
          privateContext: 'SENSITIVE'
        })
      )

      expect(body.status).toBe(503)
      expect(body.details).toEqual({ database: { status: 'down' } })
      expect(JSON.stringify(body)).not.toContain('SENSITIVE')
    })

    it('records the real message and the error itself for the request log line', () => {
      const { logged, loggedError } = run(boom)

      expect(logged).toMatchObject({ code: 'INTERNAL_ERROR', message: boom.message })
      expect(loggedError).toBe(boom)
      // The filter writes no line of its own: one line per request
      expect(logger.error).not.toHaveBeenCalled()
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
  })

  describe('client errors in the log', () => {
    it('are recorded without their stack, and not reported', () => {
      const reporter = jest.fn()
      const { logged, loggedError } = run(new NotFoundException('Story 9 not found'), {}, reporter)

      expect(logged).toEqual({ code: 'NOT_FOUND', message: 'Story 9 not found' })
      expect(loggedError).toBeUndefined()
      expect(reporter).not.toHaveBeenCalled()
    })

    it('keep query secrets out of a validation failure preview', () => {
      const { logged } = run(
        new BadRequestException(['page must be a number']),
        {},
        undefined,
        '/api/v1/x?token=SECRET&page=2'
      )

      expect(JSON.stringify(logged)).not.toContain('SECRET')
      expect(JSON.stringify(logged)).toContain('page')
    })
  })

  describe('error codes', () => {
    const code = (exception: unknown) => run(exception).body.code

    it('gives every error the generic code of its status', () => {
      expect(code(new NotFoundException('Story with ID 1 not found'))).toBe(ErrorCode.NOT_FOUND)
      expect(code(new ConflictException('Email taken'))).toBe(ErrorCode.CONFLICT)
      expect(code(new UnauthorizedException())).toBe(ErrorCode.UNAUTHORIZED)
      expect(code(new HttpException('Locked', 423))).toBe(ErrorCode.LOCKED)
      expect(code(new HttpException('Teapot', 418))).toBe(ErrorCode.BAD_REQUEST)
      expect(code(new Error('boom'))).toBe(ErrorCode.INTERNAL_ERROR)
    })

    it('marks a list of messages as a validation failure', () => {
      expect(code(new BadRequestException(['email must be an email']))).toBe(
        ErrorCode.VALIDATION_FAILED
      )
      expect(code(new BadRequestException('Tags not found: 9'))).toBe(ErrorCode.BAD_REQUEST)
    })

    it('keeps a known code set by the throw site, with its title', () => {
      const { body } = run(
        new UnauthorizedException({
          code: ErrorCode.AUTH_TOKEN_EXPIRED,
          message: 'Access token expired'
        })
      )
      expect(body).toMatchObject({
        type: 'urn:kuybi:problem:auth-token-expired',
        title: 'Access token expired',
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        detail: 'Access token expired'
      })
    })

    it('ignores unknown codes, and any code on a server error', () => {
      expect(code(new BadRequestException({ code: 'MADE_UP', message: 'x' }))).toBe(
        ErrorCode.BAD_REQUEST
      )
      expect(
        code(new InternalServerErrorException({ code: ErrorCode.AUTH_TOKEN_EXPIRED, message: 'x' }))
      ).toBe(ErrorCode.INTERNAL_ERROR)
    })
  })
})
