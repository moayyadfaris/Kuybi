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
  const defaultBucket = process.env.S3_BUCKET || 'kuybi-dev-attachments'
  const env = process.env.NODE_ENV || 'development'
  const logDir = process.env.LOG_DIR || './logs'

  return {
    app: {
      name: process.env.APP_NAME || 'kuybi-nest',
      env
    },
    http: {
      host: process.env.APP_HOST || '0.0.0.0',
      port: parseInt(process.env.APP_PORT || '4040', 10),
      corsOrigin: process.env.CORS_ORIGIN || '*'
    },
    compression: {
      enabled: parseBoolean(process.env.COMPRESSION_ENABLED, true),
      threshold: parseNumber(process.env.COMPRESSION_THRESHOLD, 1024), // 1KB
      level: parseNumber(process.env.COMPRESSION_LEVEL, 6) // 0-9, 6 is balanced
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
      username: 'debugging',
      password: process.env.DB_PASSWORD || 'postgres',
      name: process.env.DB_NAME || 'kuybi',
      logging: process.env.TYPEORM_LOGGING === 'true',
      pool: {
        enabled: parseBoolean(process.env.DB_POOL_ENABLED, env === 'production'),
        min: parseNumber(process.env.DB_POOL_MIN, env === 'production' ? 2 : 1),
        max: parseNumber(process.env.DB_POOL_MAX, env === 'production' ? 10 : 5),
        acquireTimeoutMillis: parseNumber(process.env.DB_POOL_ACQUIRE_TIMEOUT, 30000),
        idleTimeoutMillis: parseNumber(process.env.DB_POOL_IDLE_TIMEOUT, 30000)
      }
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'change-me-kuybi-secret',
      jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '10m',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      passwordChangeCooldownHours: parseNumber(process.env.PASSWORD_CHANGE_COOLDOWN_HOURS, 1),
      enableBreachDetection: parseBoolean(process.env.ENABLE_BREACH_DETECTION, true)
    },
    security: {
      accountLockout: {
        enabled: parseBoolean(process.env.ACCOUNT_LOCKOUT_ENABLED, true),
        maxAttempts: parseNumber(process.env.ACCOUNT_LOCKOUT_MAX_ATTEMPTS, 5),
        lockDuration: parseNumber(process.env.ACCOUNT_LOCKOUT_DURATION, 30 * 60 * 1000), // 30 minutes
        resetAttemptsPeriod: parseNumber(process.env.ACCOUNT_LOCKOUT_RESET_PERIOD, 15 * 60 * 1000), // 15 minutes
        trackByIpAddress: parseBoolean(process.env.ACCOUNT_LOCKOUT_TRACK_IP, true),
        notifyOnLockout: parseBoolean(process.env.ACCOUNT_LOCKOUT_NOTIFY_LOCK, true),
        notifyOnUnlock: parseBoolean(process.env.ACCOUNT_LOCKOUT_NOTIFY_UNLOCK, true)
      }
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
      ttl: parseInt(process.env.REDIS_TTL || '3600', 10), // 1 hour default
      pool: {
        enabled: parseBoolean(process.env.REDIS_POOL_ENABLED, env === 'production'),
        min: parseNumber(process.env.REDIS_POOL_MIN, env === 'production' ? 2 : 1),
        max: parseNumber(process.env.REDIS_POOL_MAX, env === 'production' ? 10 : 5)
      }
    },
    s3: {
      bucket: defaultBucket,
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET || process.env.S3_SECRET_ACCESS_KEY || '',
      baseUrl: process.env.S3_BASE_URL || `https://${defaultBucket}.s3.amazonaws.com`,
      uploadPrefix: process.env.S3_UPLOAD_PREFIX || 'uploads'
    },
    email: {
      from: process.env.EMAIL_FROM || 'noreply@kuybi.dev',
      supportEmail: process.env.EMAIL_SUPPORT || 'support@kuybi.dev',
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: parseBoolean(process.env.SMTP_SECURE, false), // true for 465, false for other ports
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || ''
      }
    },
    sentry: {
      enabled: parseBoolean(process.env.SENTRY_ENABLED, env === 'production'),
      dsn: process.env.SENTRY_DSN || '',
      environment: process.env.SENTRY_ENVIRONMENT || env,
      release: process.env.SENTRY_RELEASE || 'kuybi-nest@0.1.0',
      tracesSampleRate:
        parseNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, env === 'production' ? 10 : 0) / 100,
      profilesSampleRate:
        parseNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, env === 'production' ? 10 : 0) / 100,
      debug: parseBoolean(process.env.SENTRY_DEBUG, false)
    }
  }
}
