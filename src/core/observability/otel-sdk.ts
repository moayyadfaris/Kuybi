import { Logger } from '@nestjs/common'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import * as dotenv from 'dotenv'

// Load environment variables for configuration
dotenv.config()

const logger = new Logger('OpenTelemetry')

let sdk: NodeSDK | undefined

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

  // Metrics are exposed via Prometheus (/metrics); only export OTel metrics/logs when
  // explicitly configured, otherwise newer sdk-node versions push them to localhost:4318
  process.env.OTEL_METRICS_EXPORTER ??= 'none'
  process.env.OTEL_LOGS_EXPORTER ??= 'none'

  const traceExporter = new OTLPTraceExporter({
    url
  })

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'kuybi-backend',
      [ATTR_SERVICE_VERSION]:
        process.env.npm_package_version || process.env.APP_VERSION || 'unknown'
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
  } catch (error) {
    logger.error('Failed to start OpenTelemetry SDK', error)
    sdk = undefined
  }
}

/**
 * Flush pending spans and stop the SDK. Called from the application's graceful shutdown
 * after the HTTP server has closed; it must not exit the process itself, otherwise it
 * would cut the shutdown sequence short.
 */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return
  }
  try {
    await sdk.shutdown()
    logger.log('Tracing terminated')
  } catch (error) {
    logger.error('Error terminating tracing', error)
  } finally {
    sdk = undefined
  }
}
