import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'

let sdk: NodeSDK | null = null

/**
 * Initialize OpenTelemetry SDK
 *
 * This must be called BEFORE any other imports to ensure
 * auto-instrumentation works correctly.
 */
export function initializeOpenTelemetry(): void {
  // Check if OTel is enabled
  if (process.env.OTEL_ENABLED !== 'true') {
    console.log('📊 OpenTelemetry: Disabled (OTEL_ENABLED=false)')
    return
  }

  try {
    const serviceName = process.env.OTEL_SERVICE_NAME || 'kuybi-nest'
    const serviceVersion = process.env.OTEL_SERVICE_VERSION || '0.1.0'
    const environment = process.env.OTEL_ENVIRONMENT || 'development'
    const tracingEnabled = process.env.OTEL_TRACING_ENABLED === 'true'
    const sampleRate = parseFloat(process.env.OTEL_TRACING_SAMPLE_RATE || '1.0')
    const exporterType = process.env.OTEL_TRACING_EXPORTER || 'console'

    if (!tracingEnabled) {
      console.log('📊 OpenTelemetry: Tracing disabled (OTEL_TRACING_ENABLED=false)')
      return
    }

    // Configure trace exporter based on environment
    let traceExporter
    switch (exporterType) {
      case 'jaeger':
        traceExporter = new OTLPTraceExporter({
          url: process.env.OTEL_JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
        })
        break
      case 'otlp':
        traceExporter = new OTLPTraceExporter({
          url: process.env.OTEL_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
        })
        break
      case 'console':
      default:
        traceExporter = new ConsoleSpanExporter()
        break
    }

    // Initialize NodeSDK with auto-instrumentations
    sdk = new NodeSDK({
      serviceName,
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy instrumentations
          '@opentelemetry/instrumentation-fs': {
            enabled: false
          },
          '@opentelemetry/instrumentation-dns': {
            enabled: false
          },
          '@opentelemetry/instrumentation-net': {
            enabled: false
          },
          // Configure HTTP instrumentation
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            ignoreIncomingRequestHook: request => {
              // Don't trace health checks and metrics endpoints
              const url = request.url || ''
              return url.includes('/health') || url.includes('/metrics')
            }
          },
          // Configure Express instrumentation
          '@opentelemetry/instrumentation-express': {
            enabled: true
          },
          // Configure PostgreSQL instrumentation
          '@opentelemetry/instrumentation-pg': {
            enabled: true,
            enhancedDatabaseReporting: true
          }
        })
      ]
    })

    // Start the SDK
    sdk.start()

    console.log('✅ OpenTelemetry initialized successfully')
    console.log(`   Service: ${serviceName} v${serviceVersion}`)
    console.log(`   Environment: ${environment}`)
    console.log(`   Exporter: ${exporterType}`)
    console.log(`   Sample Rate: ${sampleRate * 100}%`)

    // Graceful shutdown
    const shutdown = async () => {
      if (sdk) {
        try {
          await sdk.shutdown()
          console.log('✅ OpenTelemetry shut down successfully')
        } catch (error) {
          console.error('❌ Error shutting down OpenTelemetry:', error)
        }
      }
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry:', error)
    // Don't crash the app if OTel fails to initialize
  }
}

/**
 * Get the current OpenTelemetry SDK instance
 */
export function getSDK(): NodeSDK | null {
  return sdk
}
