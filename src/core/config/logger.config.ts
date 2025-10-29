import { Params } from 'nestjs-pino'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import * as path from 'path'

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

/**
 * Generate correlation ID for request tracing
 */
function generateCorrelationId(req: Request): string {
  return (req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`) as string
}

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
            ignore: 'pid,hostname',
            messageFormat: '{req.method} {req.url} {msg}',
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
  }>('logging')

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
      genReqId: req => generateCorrelationId(req as Request),
      level: isTest
        ? 'silent'
        : loggingConfig?.level || (appEnv === 'production' ? 'info' : 'debug'),
      transport: transports,
      redact: {
        paths: redactPaths,
        censor: '[REDACTED]'
      },
      serializers: {
        req(req: Request) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: {
              host: req.headers.host,
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type']
            },
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort
          }
        },
        res(res: any) {
          return {
            statusCode: res.statusCode,
            headers: res.headers || {}
          }
        },
        err(err: Error) {
          return {
            type: err.name,
            message: err.message,
            stack: err.stack
          }
        }
      },
      autoLogging: {
        ignore: req => {
          const ignorePaths = ['/health', '/favicon.ico', '/robots.txt']
          return ignorePaths.some(pathEntry => req.url?.startsWith(pathEntry))
        }
      },
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) {
          return 'error'
        } else if (res.statusCode >= 400) {
          return 'warn'
        } else if (res.statusCode >= 300) {
          return 'info'
        }
        return 'debug'
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${req.url} completed with ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.url} failed with ${res.statusCode}: ${err.message}`,
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
