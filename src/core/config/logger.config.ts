import { ConfigService } from '@nestjs/config'
import { pathOf, redactQuery } from '@shared/utils/redact.util'
import { clientIp, requestIdOf } from '@shared/utils/request.util'
import { Request, Response } from 'express'
import { Params } from 'nestjs-pino'
import * as path from 'path'
import pino from 'pino'

import { elapsedMs, httpLogLevel, httpLogMessage, httpLogProps } from '@core/logging/http-log'

/**
 * Pino Logger Configuration
 *
 * Features:
 * - Environment-based log levels (debug in dev, info in prod)
 * - Pretty-print in development for readability
 * - Structured JSON in production for log aggregation
 * - Request correlation IDs for distributed tracing
 * - Automatic redaction of sensitive data
 * - Custom serializers for better context
 * - Performance optimized (5-10x faster than Winston)
 */

/**
 * Fields to redact from logs (security sensitive)
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.oldPassword',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.otp',
  'req.body.secret',
  'req.body.apiKey',
  'res.headers["set-cookie"]',
  'user.password',
  'user.passwordHash',
  'user.refreshToken',
  'session.refreshToken',
  'session.accessToken'
]

const buildTransports = (options: {
  enableConsole: boolean
  prettyConsole: boolean
  activeDir: string
  appEnv: string
}) => {
  const targets = []
  if (options.enableConsole) {
    targets.push({
      level: 'debug' as const,
      target: options.prettyConsole ? 'pino-pretty' : 'pino/file',
      options: options.prettyConsole
        ? {
            colorize: true,
            levelFirst: true,
            translateTime: 'SYS:HH:MM:ss.l',
            // One readable line per request; the full record stays in the log files
            ignore:
              'pid,hostname,req,res,trace_id,span_id,trace_flags,route,userId,sessionId,errorCode,errorMessage,request,slow,responseTime,context',
            messageFormat:
              '{msg}{if errorMessage} - {errorMessage}{end}{if responseTime} ({responseTime}ms){end}',
            singleLine: false,
            errorLikeObjectKeys: ['err', 'error']
          }
        : {
            destination: 1 // stdout
          }
    })
  }

  targets.push(
    {
      level: 'info' as const,
      target: 'pino/file',
      options: {
        destination: path.join(options.activeDir, 'server.log'),
        mkdir: true
      }
    },
    {
      level: 'error' as const,
      target: 'pino/file',
      options: {
        destination: path.join(options.activeDir, 'error.log'),
        mkdir: true
      }
    }
  )

  return targets
}

/**
 * Build Pino configuration using centralized config service values
 */
export const createLoggerConfig = (configService: ConfigService): Params => {
  const appEnv = configService.get<string>('app.env', 'development')
  const loggingConfig = configService.get<{
    level: string
    console: { enabled: boolean; pretty: boolean }
    directories: { active: string }
    slowRequestMs: number
  }>('logging')
  const slowMs = loggingConfig?.slowRequestMs ?? 1000

  const isTest = appEnv === 'test'
  const transports = isTest
    ? undefined
    : {
        targets: buildTransports({
          enableConsole: loggingConfig?.console?.enabled ?? appEnv !== 'production',
          prettyConsole: loggingConfig?.console?.pretty ?? appEnv !== 'production',
          activeDir: loggingConfig?.directories?.active || './logs',
          appEnv
        })
      }

  return {
    pinoHttp: {
      genReqId: req => requestIdOf(req as Request),
      level: isTest
        ? 'silent'
        : loggingConfig?.level || (appEnv === 'production' ? 'info' : 'debug'),
      transport: transports,
      redact: {
        paths: redactPaths,
        censor: '[REDACTED]'
      },
      serializers: {
        // pino-http passes a wrapper; `raw` is the Express request (proxy-aware req.ip)
        req(wrapped: Request & { raw?: Request }) {
          const req = wrapped.raw ?? wrapped
          return {
            id: req.id,
            method: req.method,
            // The path only; the query is logged separately, with secrets masked
            url: pathOf(req.originalUrl ?? req.url),
            query: redactQuery(req.query),
            userAgent: req.headers['user-agent'],
            ip: clientIp(req)
          }
        },
        // The status only: response headers (security policy, cache headers) are the
        // same on every response and made each line kilobytes long
        res(res: { statusCode?: number }) {
          return { statusCode: res.statusCode }
        },
        // Type, message, stack, and the chain of causes (Error.cause)
        err: pino.stdSerializers.errWithCause
      },
      autoLogging: {
        ignore: req => {
          // Probes hit /api/health every few seconds
          const ignorePaths = ['/api/health', '/health', '/favicon.ico', '/robots.txt']
          return ignorePaths.some(pathEntry => req.url?.startsWith(pathEntry))
        }
      },
      // One line per request (see core/logging/http-log.ts): HttpExceptionFilter records
      // the error on the response, and this line carries it
      customLogLevel: (req, res, err) =>
        httpLogLevel(res.statusCode, !!err, elapsedMs(req as Request), slowMs),
      customProps: (req, res) => httpLogProps(req as Request, res as Response, slowMs),
      customSuccessMessage: (req, res) => httpLogMessage(req as Request, res as Response),
      customErrorMessage: (req, res) => httpLogMessage(req as Request, res as Response),
      base:
        appEnv === 'development'
          ? { pid: process.pid }
          : {
              pid: process.pid,
              hostname: process.env.HOSTNAME,
              environment: appEnv,
              service: configService.get<string>('app.name', 'kuybi-nest'),
              version: process.env.npm_package_version || '1.0.0'
            },
      timestamp: () => `,"time":"${new Date().toISOString()}"`
    }
  }
}

/**
 * Logger context options
 * Use these when creating child loggers
 */
export const loggerContextOptions = {
  // Auth module context
  auth: { context: 'AuthModule', module: 'auth' },
  session: { context: 'SessionModule', module: 'session' },
  user: { context: 'UserModule', module: 'user' },

  // Repository context
  repository: { context: 'Repository', layer: 'data' },

  // Service context
  service: { context: 'Service', layer: 'business' },

  // Controller context
  controller: { context: 'Controller', layer: 'presentation' },

  // Cron job context
  cron: { context: 'CronJob', type: 'scheduled' },

  // Cache context
  cache: { context: 'Cache', type: 'caching' }
}

/**
 * Performance measurement helper
 */
export function measurePerformance(startTime: number): { duration: number; durationMs: string } {
  const duration = Date.now() - startTime
  return {
    duration,
    durationMs: `${duration}ms`
  }
}
