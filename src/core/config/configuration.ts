const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback
  }
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseList = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback
  }
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

export default () => {
  const defaultBucket = process.env.S3_BUCKET || 'susanoo-dev-attachments'
  const env = process.env.NODE_ENV || 'development'
  const logDir = process.env.LOG_DIR || './logs'

  return ({
    app: {
      name: process.env.APP_NAME || 'susanoo-nest',
      env
    },
    http: {
      host: process.env.APP_HOST || '0.0.0.0',
      port: parseInt(process.env.APP_PORT || '4040', 10),
      corsOrigin: process.env.CORS_ORIGIN || '*'
    },
    logging: {
      level: process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'),
      console: {
        enabled: parseBoolean(process.env.LOG_ENABLE_CONSOLE, env !== 'production'),
        pretty: parseBoolean(process.env.LOG_PRETTY_PRINT, env !== 'production')
      },
      directories: {
        active: logDir,
        archive: process.env.LOG_ARCHIVE_DIR || `${logDir}/archive`
      },
      rotation: {
        enabled: parseBoolean(process.env.LOG_ROTATION_ENABLED, true),
        maxBytes: parseNumber(process.env.LOG_ROTATE_MAX_BYTES, 10 * 1024 * 1024),
        checkIntervalMinutes: parseNumber(process.env.LOG_ROTATE_CHECK_INTERVAL, 15)
      },
      retentionDays: parseNumber(process.env.LOG_RETENTION_DAYS, 7),
      payloadPreview: {
        allowedFields: parseList(process.env.LOG_SAFE_FIELDS, [
          'id',
          'title',
          'status',
          'type',
          'priority',
          'userId',
          'email'
        ]),
        maxFieldLength: parseNumber(process.env.LOG_PAYLOAD_FIELD_LIMIT, 160)
      },
      shipper: {
        enabled: parseBoolean(process.env.LOG_SHIPPER_ENABLED, false),
        endpoint: process.env.LOG_SHIPPER_ENDPOINT,
        apiKey: process.env.LOG_SHIPPER_API_KEY,
        flushOnRotateOnly: parseBoolean(process.env.LOG_SHIPPER_FLUSH_ON_ROTATE, true)
      }
    },
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      name: process.env.DB_NAME || 'susanoo',
      logging: process.env.TYPEORM_LOGGING === 'true'
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'change-me-susanoo-secret',
      jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '10m',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    rateLimit: {
      ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '20', 10)
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      queueDb: parseInt(process.env.REDIS_QUEUE_DB || '1', 10), // Separate DB for queues
      ttl: parseInt(process.env.REDIS_TTL || '3600', 10) // 1 hour default
    },
    s3: {
      bucket: defaultBucket,
      region: process.env.S3_REGION || 'us-east-1',
      baseUrl: process.env.S3_BASE_URL || `https://${defaultBucket}.s3.amazonaws.com`,
      uploadPrefix: process.env.S3_UPLOAD_PREFIX || 'uploads'
    },
    bullBoard: {
      username: process.env.BULL_BOARD_USERNAME || 'admin',
      password: process.env.BULL_BOARD_PASSWORD || 'admin123',
      port: parseInt(process.env.BULL_BOARD_PORT || '4050', 10)
    }
  })
}
