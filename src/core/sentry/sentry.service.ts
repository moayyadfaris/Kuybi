import { Inject, Injectable } from '@nestjs/common'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { errorMessage, errorStack } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

export interface SentryUser {
  id: string
  email?: string
  username?: string
}

export interface SentryOptions {
  enabled: boolean
  dsn: string
  environment: string
  release: string
  tracesSampleRate: number
  profilesSampleRate: number
  debug: boolean
}

@Injectable()
export class SentryService {
  private isInitialized = false

  constructor(
    @Inject('SENTRY_OPTIONS') private readonly options: SentryOptions,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(SentryService.name)

    if (this.options.enabled && this.options.dsn) {
      this.initialize()
    } else if (this.options.enabled && !this.options.dsn) {
      this.logger.warn(
        'Sentry is enabled but DSN is not configured. Sentry will not be initialized.'
      )
    } else {
      this.logger.info('Sentry is disabled via configuration')
    }
  }

  private initialize() {
    try {
      Sentry.init({
        dsn: this.options.dsn,
        environment: this.options.environment,
        release: this.options.release,
        tracesSampleRate: this.options.tracesSampleRate,
        // v11 replaced per-transaction profiling with session sampling; 'trace' profiles
        // while a trace is active, the closest match to the old behaviour
        profileSessionSampleRate: this.options.profilesSampleRate,
        profileLifecycle: 'trace',
        debug: this.options.debug,
        attachStacktrace: true,
        // v11 collects much more by default when this is unset (request and response
        // bodies, cookies, user info, DB queries, queue payloads). Bodies here carry
        // passwords, access/refresh tokens and reset links, so keep the v10 baseline.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: {
            request: {
              deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'authorization', 'cookie']
            },
            response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'set-cookie'] }
          },
          httpBodies: [],
          urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'token'] },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          graphQL: { document: false, variables: false }
        },
        integrations: [
          Sentry.httpIntegration(),
          // SentryInterceptor / SentryFilter report errors; v11's automatic Express capture
          // would report them twice
          Sentry.expressIntegration({ shouldHandleError: () => false }),
          nodeProfilingIntegration()
        ],
        beforeSend: (event, _hint) => {
          // Filter sensitive data from request headers
          if (event.request?.headers) {
            delete event.request.headers.authorization
            delete event.request.headers.cookie
            delete event.request.headers['x-api-key']
          }

          // Filter sensitive data from request body
          if (event.request?.data) {
            const data = event.request.data as Record<string, unknown>
            if (typeof data === 'object' && data !== null) {
              delete data.password
              delete data.token
              delete data.secret
            }
          }

          return event
        }
      })

      this.isInitialized = true

      this.logger.info({
        msg: 'Sentry initialized successfully',
        environment: this.options.environment,
        release: this.options.release,
        tracesSampleRate: this.options.tracesSampleRate,
        profilesSampleRate: this.options.profilesSampleRate
      })
    } catch (error) {
      this.logger.error({
        msg: 'Failed to initialize Sentry',
        error: errorMessage(error),
        stack: errorStack(error)
      })
    }
  }

  /**
   * Capture an exception and send it to Sentry
   */
  captureException(exception: Error | unknown, context?: Record<string, unknown>) {
    if (!this.isInitialized) return

    try {
      Sentry.captureException(exception, {
        contexts: context ? { custom: context } : undefined
      })
    } catch (error) {
      this.logger.error({
        msg: 'Failed to capture exception in Sentry',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Capture a message and send it to Sentry
   */
  captureMessage(
    message: string,
    level: SeverityLevel = 'info',
    context?: Record<string, unknown>
  ) {
    if (!this.isInitialized) return

    try {
      Sentry.captureMessage(message, {
        level,
        contexts: context ? { custom: context } : undefined
      })
    } catch (error) {
      this.logger.error({
        msg: 'Failed to capture message in Sentry',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: SentryUser) {
    if (!this.isInitialized) return

    try {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.username
      })
    } catch (error) {
      this.logger.error({
        msg: 'Failed to set user in Sentry',
        error: errorMessage(error)
      })
    }
  }

  /**
   * Clear user context
   */
  clearUser() {
    if (!this.isInitialized) return

    try {
      Sentry.setUser(null)
    } catch (error) {
      this.logger.error({
        msg: 'Failed to clear user in Sentry',
        error: errorMessage(error)
      })
    }
  }

  /**
   * Add breadcrumb for debugging context
   */
  addBreadcrumb(message: string, category: string, data?: Record<string, unknown>) {
    if (!this.isInitialized) return

    try {
      Sentry.addBreadcrumb({
        message,
        category,
        data,
        level: 'info'
      })
    } catch (error) {
      this.logger.error({
        msg: 'Failed to add breadcrumb in Sentry',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Set custom context/tags for error tracking
   */
  setContext(key: string, value: Record<string, unknown>) {
    if (!this.isInitialized) return

    try {
      Sentry.setContext(key, value)
    } catch (error) {
      this.logger.error({
        msg: 'Failed to set context in Sentry',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Set tag for filtering errors
   */
  setTag(key: string, value: string) {
    if (!this.isInitialized) return

    try {
      Sentry.setTag(key, value)
    } catch (error) {
      this.logger.error({
        msg: 'Failed to set tag in Sentry',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Check if Sentry is enabled and initialized
   */
  isEnabled(): boolean {
    return this.isInitialized
  }
}
