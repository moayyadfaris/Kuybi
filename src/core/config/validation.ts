import { ENVIRONMENTS, isLocalEnvironment } from '@shared/utils/environment'
import { plainToInstance } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, validateSync } from 'class-validator'

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

  @IsInt()
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

  @IsInt()
  @IsOptional()
  DB_PORT?: number

  @IsString()
  @IsOptional()
  DB_USER?: string

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

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string

  // bcrypt cost; 4 is only for fast tests (see assertProductionSecrets)
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

  @IsInt()
  @IsOptional()
  THROTTLE_TTL?: number

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

  @IsInt()
  @IsOptional()
  LOG_ROTATE_MAX_BYTES?: number

  @IsInt()
  @IsOptional()
  LOG_ROTATE_CHECK_INTERVAL?: number

  @IsInt()
  @IsOptional()
  LOG_RETENTION_DAYS?: number

  @IsString()
  @IsOptional()
  LOG_SAFE_FIELDS?: string

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

  // Prefix of every cache key; letters, digits, dot, dash and underscore
  @Matches(/^[A-Za-z0-9._-]+$/)
  @IsOptional()
  CACHE_NAMESPACE?: string

  @IsString()
  @IsOptional()
  AUDIT_ENABLED?: string

  @IsInt()
  @Min(0)
  @IsOptional()
  AUDIT_RETENTION_DAYS?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  AUDIT_CRITICAL_RETENTION_DAYS?: number

  @IsInt()
  @IsOptional()
  S3_TIMEOUT_MS?: number

  @IsInt()
  @IsOptional()
  S3_CIRCUIT_BREAKER_FAILURES?: number

  @IsInt()
  @IsOptional()
  S3_CIRCUIT_BREAKER_RESET_MS?: number

  @IsInt()
  @IsOptional()
  SMTP_TIMEOUT_MS?: number

  @IsInt()
  @IsOptional()
  SMTP_CIRCUIT_BREAKER_FAILURES?: number

  @IsInt()
  @IsOptional()
  SMTP_CIRCUIT_BREAKER_RESET_MS?: number

  @IsInt()
  @IsOptional()
  CACHE_TIMEOUT_MS?: number

  @IsInt()
  @IsOptional()
  CACHE_CIRCUIT_BREAKER_FAILURES?: number

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
    const rounds = config.BCRYPT_ROUNDS
    if (typeof rounds === 'number' && rounds < MIN_DEPLOYED_BCRYPT_ROUNDS) {
      problems.push(`BCRYPT_ROUNDS must be at least ${MIN_DEPLOYED_BCRYPT_ROUNDS} in ${env}`)
    }

    const corsOrigin = config.CORS_ORIGIN
    if (typeof corsOrigin !== 'string' || corsOrigin.split(',').some(o => o.trim() === '*')) {
      problems.push(`CORS_ORIGIN must list the allowed origins in ${env} (no "*")`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Insecure ${env} configuration:\n  - ${problems.join('\n  - ')}`)
  }
}
