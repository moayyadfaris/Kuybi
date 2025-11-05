import {
  Sampler,
  SamplingDecision,
  SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import { Context, SpanKind, Attributes } from '@opentelemetry/api';

/**
 * Custom intelligent sampler that implements:
 * 1. Always samples errors (status >= 500)
 * 2. Always samples critical business operations
 * 3. Head-based sampling for other operations
 * 4. Deterministic sampling based on trace ID
 */
export class CustomSampler implements Sampler {
  private readonly criticalOperations: Set<string>;

  constructor(
    private readonly baseSampleRate: number = 0.1, // 10% default
    private readonly errorSampleRate: number = 1.0, // 100% errors
    criticalOperations: string[] = [
      'auth.login',
      'auth.logout',
      'payment.process',
      'story.create',
    ],
  ) {
    this.criticalOperations = new Set(criticalOperations);
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
  ): SamplingResult {
    // Always sample errors
    const statusCode = attributes['http.status_code'] as number;
    const hasError = attributes['error'] === true;

    if (hasError || (statusCode && statusCode >= 500)) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          'sampling.reason': 'error',
        },
      };
    }

    // Always sample critical operations
    if (this.criticalOperations.has(spanName)) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          'sampling.reason': 'critical_operation',
        },
      };
    }

    // Head-based sampling for others (deterministic based on trace ID)
    const shouldSample = this.deterministicSample(traceId, this.baseSampleRate);

    return {
      decision: shouldSample
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD,
      attributes: shouldSample
        ? {
            'sampling.reason': 'head_based',
            'sampling.rate': this.baseSampleRate,
          }
        : undefined,
    };
  }

  /**
   * Deterministic sampling based on trace ID hash
   * Ensures consistent sampling decisions across distributed services
   */
  private deterministicSample(traceId: string, rate: number): boolean {
    // Use first 8 characters of trace ID for hash
    const hash = parseInt(traceId.substring(0, 8), 16);
    return (hash % 100) < rate * 100;
  }

  toString(): string {
    return `CustomSampler{base=${this.baseSampleRate}, error=${this.errorSampleRate}, critical=${this.criticalOperations.size}}`;
  }
}
