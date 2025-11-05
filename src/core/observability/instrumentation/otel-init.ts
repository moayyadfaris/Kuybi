import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  SpanProcessor
} from '@opentelemetry/sdk-trace-base'
import { CustomSampler } from '../samplers/custom.sampler'

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
    const tracingEnabled = process.env.OTEL_TRACING_ENABLED !== 'false'

    if (!tracingEnabled) {
      console.log('📊 OpenTelemetry: Tracing disabled (OTEL_TRACING_ENABLED=false)')
      return
    }

    // Parse sampling configuration
    const samplingRate = parseFloat(
      process.env.OTEL_SAMPLING_RATE || (environment === 'production' ? '0.1' : '1.0')
    )
    const samplingErrorRate = parseFloat(process.env.OTEL_SAMPLING_ERROR_RATE || '1.0')
    const criticalOps = (process.env.OTEL_SAMPLING_CRITICAL_OPS || '').split(',').filter(Boolean)

    // Initialize custom sampler
    const sampler = new CustomSampler(
      samplingRate,
      samplingErrorRate,
      criticalOps.length > 0
        ? criticalOps
        : ['auth.login', 'auth.logout', 'payment.process', 'story.create']
    )

    // Configure exporters
    const spanProcessors: SpanProcessor[] = []
    const enabledExporters: string[] = []

    // Console exporter (development)
    if (process.env.OTEL_EXPORTER_CONSOLE === 'true' || environment !== 'production') {
      const consoleExporter = new ConsoleSpanExporter()
      spanProcessors.push(new SimpleSpanProcessor(consoleExporter))
      enabledExporters.push('console')
    }

    // Jaeger exporter
    if (process.env.OTEL_EXPORTER_JAEGER === 'true') {
      const jaegerExporter = new JaegerExporter({
        endpoint: process.env.OTEL_JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        tags: [
          { key: 'service.name', value: serviceName },
          { key: 'service.version', value: serviceVersion },
          { key: 'deployment.environment', value: environment }
        ]
      })

      // Use BatchSpanProcessor for production efficiency
      spanProcessors.push(
        new BatchSpanProcessor(jaegerExporter, {
          maxQueueSize: 2048,
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
          exportTimeoutMillis: 30000
        })
      )
      enabledExporters.push('jaeger')
    }

    // OTLP exporter (cloud-native)
    if (process.env.OTEL_EXPORTER_OTLP === 'true') {
      const otlpHeaders = process.env.OTEL_OTLP_HEADERS || '{}'
      const otlpExporter = new OTLPTraceExporter({
        url: process.env.OTEL_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        headers: JSON.parse(otlpHeaders)
      })

      spanProcessors.push(new BatchSpanProcessor(otlpExporter))
      enabledExporters.push('otlp')
    }

    // Ensure at least one exporter is configured
    if (spanProcessors.length === 0) {
      console.warn('⚠️  No trace exporters configured, using console exporter')
      spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))
      enabledExporters.push('console (fallback)')
    }

    // Initialize NodeSDK with auto-instrumentations
    sdk = new NodeSDK({
      serviceName,
      sampler,
      spanProcessors,
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
    console.log(`   Sampling: ${samplingRate * 100}% (errors: ${samplingErrorRate * 100}%)`)
    console.log(`   Exporters: ${enabledExporters.join(', ')}`)

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
