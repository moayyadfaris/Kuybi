import { ENVIRONMENTS, isLocalEnvironment } from '@shared/utils/environment'
import { plainToInstance, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, validateSync } from 'class-validator'

// @Type reads decorator metadata: load the polyfill even when this module is imported first
import 'reflect-metadata'

/** A switch as configuration.ts parses it (parseBoolean): anything else would read as false */
const IsBooleanText = () =>
  Matches(/^(true|false|1|0|yes|no|on|off)$/i, { message: '$property must be true or false' })

class EnvironmentVariables {
  // A typo such as "prod" must not boot with the development defaults
  @IsIn(ENVIRONMENTS)
  @IsOptional()
  NODE_ENV?: string

  @IsString()
  @IsOptional()
  APP_NAME?: string

  @IsString()
  @IsOptional()
  APP_HOST?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  APP_PORT?: number

  @IsString()
  CORS_ORIGIN?: string

  @IsString()
  @IsOptional()
  TRUST_PROXY?: string

  @IsString()
  @IsOptional()
  DB_HOST?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  DB_PORT?: number

  @IsString()
  @IsOptional()
  DB_USERNAME?: string

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string

  @IsString()
  @IsOptional()
  DB_NAME?: string

  @IsString()
  @IsOptional()
  JWT_SECRET?: string

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN?: string

  // Session and refresh-token lifetime: a number and d, h or m (30d, 12h, 90m)
  @Matches(/^\d+[dhm]$/)
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string

  // bcrypt cost; 4 is only for fast tests (see assertProductionSecrets)
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(15)
  @IsOptional()
  BCRYPT_ROUNDS?: number

  @IsString()
  @IsOptional()
  S3_BUCKET?: string

  @IsString()
  @IsOptional()
  S3_REGION?: string

  @IsString()
  @IsOptional()
  S3_BASE_URL?: string

  @IsString()
  @IsOptional()
  S3_UPLOAD_PREFIX?: string

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  THROTTLE_TTL?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  THROTTLE_LIMIT?: number

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string

  @IsString()
  @IsOptional()
  LOG_DIR?: string

  @IsString()
  @IsOptional()
  LOG_ARCHIVE_DIR?: string

  @IsString()
  @IsOptional()
  LOG_ENABLE_CONSOLE?: string

  @IsString()
  @IsOptional()
  LOG_PRETTY_PRINT?: string

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  LOG_ROTATE_MAX_BYTES?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  LOG_ROTATE_CHECK_INTERVAL?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  LOG_RETENTION_DAYS?: number

  @IsString()
  @IsOptional()
  LOG_SAFE_FIELDS?: string

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  LOG_PAYLOAD_FIELD_LIMIT?: number

  @IsString()
  @IsOptional()
  LOG_SHIPPER_ENABLED?: string

  @IsString()
  @IsOptional()
  LOG_SHIPPER_ENDPOINT?: string

  @IsString()
  @IsOptional()
  LOG_SHIPPER_API_KEY?: string

  @IsString()
  @IsOptional()
  EMAIL_FROM?: string

  @IsString()
  @IsOptional()
  EMAIL_SUPPORT?: string

  @IsString()
  @IsOptional()
  SMTP_HOST?: string

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_PORT?: number

  @IsString()
  @IsOptional()
  SMTP_SECURE?: string

  @IsString()
  @IsOptional()
  SMTP_USER?: string

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string

  // Public site for emailed links; required (http/https) outside development and test
  @IsString()
  @IsOptional()
  APP_PUBLIC_URL?: string

  // Prefix of every cache key; letters, digits, dot, dash and underscore
  @Matches(/^[A-Za-z0-9._-]+$/)
  @IsOptional()
  CACHE_NAMESPACE?: string

  @IsBooleanText()
  @IsOptional()
  AUDIT_ENABLED?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  AUDIT_RETENTION_DAYS?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  AUDIT_CRITICAL_RETENTION_DAYS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  S3_TIMEOUT_MS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  S3_CIRCUIT_BREAKER_FAILURES?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  S3_CIRCUIT_BREAKER_RESET_MS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_TIMEOUT_MS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_CIRCUIT_BREAKER_FAILURES?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_CIRCUIT_BREAKER_RESET_MS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  CACHE_TIMEOUT_MS?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  CACHE_CIRCUIT_BREAKER_FAILURES?: number

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  CACHE_CIRCUIT_BREAKER_RESET_MS?: number

  @IsString()
  @IsOptional()
  OBSERVABILITY_TRACING_ENABLED?: string

  @IsString()
  @IsOptional()
  OBSERVABILITY_JAEGER_HOST?: string

  @IsString()
  @IsOptional()
  OBSERVABILITY_JAEGER_PORT?: string

  // Numbers and switches read by configuration.ts: a typo fails at startup instead of
  // becoming NaN or a silent "false"
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(15)
  @IsOptional()
  REDIS_DB?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(15)
  @IsOptional()
  REDIS_QUEUE_DB?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  REDIS_TTL?: number

  @IsBooleanText()
  @IsOptional()
  DB_POOL_ENABLED?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  DB_POOL_MIN?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  DB_POOL_MAX?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  DB_POOL_IDLE_TIMEOUT?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  DB_POOL_ACQUIRE_TIMEOUT?: number

  @IsBooleanText()
  @IsOptional()
  TYPEORM_LOGGING?: string

  @IsBooleanText()
  @IsOptional()
  ACCOUNT_LOCKOUT_ENABLED?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ACCOUNT_LOCKOUT_MAX_ATTEMPTS?: number

  // Milliseconds
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  ACCOUNT_LOCKOUT_DURATION?: number

  // Milliseconds
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  ACCOUNT_LOCKOUT_RESET_PERIOD?: number

  @IsBooleanText()
  @IsOptional()
  ACCOUNT_LOCKOUT_NOTIFY_LOCK?: string

  @IsBooleanText()
  @IsOptional()
  ACCOUNT_LOCKOUT_NOTIFY_UNLOCK?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  PASSWORD_CHANGE_COOLDOWN_HOURS?: number

  @IsBooleanText()
  @IsOptional()
  ENABLE_BREACH_DETECTION?: string

  @IsBooleanText()
  @IsOptional()
  ATTACHMENT_ASYNC_PROCESSING?: string

  // Megabytes of multipart uploads a process holds in memory at once
  @Type(() => Number)
  @IsInt()
  @Min(110)
  @IsOptional()
  ATTACHMENT_MAX_IN_FLIGHT_MB?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  STORY_KEEP_AUTO_VERSIONS?: number

  @IsBooleanText()
  @IsOptional()
  SWAGGER_ENABLED?: string

  @IsBooleanText()
  @IsOptional()
  LOG_ROTATION_ENABLED?: string

  @IsBooleanText()
  @IsOptional()
  LOG_SHIPPER_FLUSH_ON_ROTATE?: string

  @IsBooleanText()
  @IsOptional()
  SENTRY_ENABLED?: string

  @IsBooleanText()
  @IsOptional()
  SENTRY_DEBUG?: string

  // Percent of requests traced / profiled
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  SENTRY_TRACES_SAMPLE_RATE?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  SENTRY_PROFILES_SAMPLE_RATE?: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  BULL_BOARD_PORT?: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  WORKER_SHUTDOWN_TIMEOUT_MS?: number
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true
  })
  const errors = validateSync(validatedConfig, { skipMissingProperties: false })

  if (errors.length > 0) {
    throw new Error(errors.toString())
  }

  assertProductionSecrets(config)

  return validatedConfig
}

const MIN_SECRET_LENGTH = 32
const MIN_DEPLOYED_BCRYPT_ROUNDS = 10
const PLACEHOLDER_PATTERN = /change-me|changeme|admin123|^secret$|^password$/i

/**
 * Fails fast when secrets are missing, short, or left at placeholder values, and when
 * CORS is left open. Applies to every environment except development and test (staging
 * included), so a deployed instance can never boot with the local defaults.
 */
export function assertProductionSecrets(
  config: Record<string, unknown>,
  required: string[] = ['JWT_SECRET', 'DB_PASSWORD']
): void {
  const env = typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development'
  if (isLocalEnvironment(env)) {
    return
  }

  const problems = required.flatMap(key => {
    const value = config[key]
    if (typeof value !== 'string' || value.length === 0) {
      return [`${key} is required in ${env}`]
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      return [`${key} uses a placeholder value`]
    }
    if (key === 'JWT_SECRET' && value.length < MIN_SECRET_LENGTH) {
      return [`${key} must be at least ${MIN_SECRET_LENGTH} characters`]
    }
    return []
  })

  // Only when validating the app's own config (custom key lists check just those keys)
  if (required.includes('JWT_SECRET')) {
    // Environment values are strings; validate() converts only its own copy
    const rounds = Number(config.BCRYPT_ROUNDS)
    if (config.BCRYPT_ROUNDS !== undefined && rounds < MIN_DEPLOYED_BCRYPT_ROUNDS) {
      problems.push(`BCRYPT_ROUNDS must be at least ${MIN_DEPLOYED_BCRYPT_ROUNDS} in ${env}`)
    }

    const corsOrigin = config.CORS_ORIGIN
    if (typeof corsOrigin !== 'string' || corsOrigin.split(',').some(o => o.trim() === '*')) {
      problems.push(`CORS_ORIGIN must list the allowed origins in ${env} (no "*")`)
    }

    // Emailed links would otherwise point at localhost
    const publicUrl = config.APP_PUBLIC_URL
    if (typeof publicUrl !== 'string' || !/^https?:\/\/[^\s/]+/.test(publicUrl)) {
      problems.push(`APP_PUBLIC_URL must be the site's http(s) URL in ${env}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Insecure ${env} configuration:\n  - ${problems.join('\n  - ')}`)
  }
}
