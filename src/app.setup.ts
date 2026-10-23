import { INestApplication, NestInterceptor, Type, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpExceptionFilter } from '@shared/filters/http-exception.filter'
import { RequestIdInterceptor } from '@shared/interceptors/request-id.interceptor'
import { TransformInterceptor } from '@shared/interceptors/transform.interceptor'
import { TrustProxySetting } from '@shared/utils/request.util'
import compression from 'compression'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'

import { RequestIdMiddleware } from '@core/http/middleware/request-id.middleware'
import { LoggingContextInterceptor } from '@core/logging/logging-context.interceptor'
import { LoggingContextService } from '@core/logging/logging-context.service'
import { SentryInterceptor, SentryService } from '@core/sentry'

interface HttpConfig {
  corsOrigin: string
  trustProxy: TrustProxySetting
}

interface CompressionConfig {
  enabled: boolean
  threshold: number
  level: number
}

/**
 * The HTTP pipeline shared by the API (main.ts) and the integration tests: security
 * headers, CORS, the /api prefix, compression, validation, the global exception filter
 * and the global interceptors. Tests that build their own pipeline test a different API.
 *
 * Providers a test module may leave out (LoggingContextService, SentryService) are
 * optional; ConfigService and the nestjs-pino Logger are required.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService)
  const logger = app.get(Logger)
  const optional = <T>(token: Type<T>): T | undefined => {
    try {
      return app.get(token, { strict: false })
    } catch {
      return undefined
    }
  }

  // req.ip (rate limiting, sessions, audit) comes from X-Forwarded-For only through
  // these proxies; without it every client behind a load balancer shares one IP
  const httpConfig = configService.get<HttpConfig>('http')
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', httpConfig?.trustProxy ?? false)

  // First, before the request logger: every log line, audit entry and error response
  // of the request carries the same id
  const requestIds = new RequestIdMiddleware()
  app.use(requestIds.use.bind(requestIds))

  app.use(helmet())

  const corsOrigin = httpConfig?.corsOrigin ?? '*'
  app.enableCors({
    origin: corsOrigin.includes(',') ? corsOrigin.split(',').map(o => o.trim()) : corsOrigin,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Idempotency-Key'
  })

  // Admin API: /api/v1/*, public web API: /api/web/v1/* (versions live in the controller
  // paths). /metrics stays unprefixed for Prometheus.
  app.setGlobalPrefix('api', { exclude: ['/metrics'] })

  const compressionConfig = configService.get<CompressionConfig>('compression', {
    enabled: true,
    threshold: 1024,
    level: 6
  })
  if (compressionConfig.enabled) {
    app.use(
      compression({
        filter: (req, res) => {
          if (req.headers['x-no-compression']) {
            return false
          }
          if (res.getHeader('Content-Type')?.toString().includes('application/json')) {
            return true
          }
          return compression.filter(req, res)
        },
        threshold: compressionConfig.threshold,
        level: compressionConfig.level
      })
    )
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )

  const sentry = optional(SentryService)
  const sentryEnabled = sentry?.isEnabled() ?? false

  // The only global filter, so every error has the same shape. It reports 5xx to Sentry.
  app.useGlobalFilters(
    new HttpExceptionFilter(
      logger,
      configService,
      sentryEnabled
        ? (exception, request, status) =>
            sentry?.captureException(exception, {
              statusCode: status,
              method: request.method,
              path: request.url
            })
        : undefined
    )
  )

  const interceptors: NestInterceptor[] = [new RequestIdInterceptor()]
  if (sentry && sentryEnabled) {
    interceptors.push(new SentryInterceptor(sentry))
  }
  const loggingContext = optional(LoggingContextService)
  if (loggingContext) {
    interceptors.push(new LoggingContextInterceptor(loggingContext, configService))
  }
  interceptors.push(new TransformInterceptor())
  app.useGlobalInterceptors(...interceptors)
}
