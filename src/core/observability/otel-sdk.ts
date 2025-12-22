import { Logger } from '@nestjs/common'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions'
import * as dotenv from 'dotenv'

// Load environment variables for configuration
dotenv.config()

const logger = new Logger('OpenTelemetry')

export function initTracing() {
  const isEnabled = process.env.OBSERVABILITY_TRACING_ENABLED !== 'false'

  if (!isEnabled) {
    logger.log('Tracing is disabled via OBSERVABILITY_TRACING_ENABLED')
    return
  }

  const jaegerHost = process.env.OBSERVABILITY_JAEGER_HOST || 'localhost'
  const jaegerPort = process.env.OBSERVABILITY_JAEGER_PORT || '4318'
  const url = `http://${jaegerHost}:${jaegerPort}/v1/traces`

  logger.log(`Initializing OpenTelemetry SDK targeting ${url}`)

  const traceExporter = new OTLPTraceExporter({
    url
  })

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: 'kuybi-backend',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0.0'
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true }
      })
    ]
  })

  try {
    sdk.start()
    logger.log('OpenTelemetry SDK started successfully')

    process.on('SIGTERM', () => {
      sdk
        .shutdown()
        .then(() => logger.log('Tracing terminated'))
        .catch(error => logger.error('Error terminating tracing', error))
        .finally(() => process.exit(0))
    })
  } catch (error) {
    logger.error('Failed to start OpenTelemetry SDK', error)
  }
}
