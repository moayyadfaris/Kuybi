import { plainToInstance } from 'class-transformer'
import { IsInt, IsOptional, IsString, validateSync } from 'class-validator'

class EnvironmentVariables {
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
  @IsOptional()
  CORS_ORIGIN?: string

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
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true
  })
  const errors = validateSync(validatedConfig, { skipMissingProperties: false })

  if (errors.length > 0) {
    throw new Error(errors.toString())
  }
  return validatedConfig
}
