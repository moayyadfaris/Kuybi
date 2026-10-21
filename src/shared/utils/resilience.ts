export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  name?: string
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenSuccesses?: number
  /** Probe calls let through at once while half-open (default 1) */
  halfOpenMaxProbes?: number
  /**
   * Whether an error counts toward opening the circuit (default: every error). Answers
   * about the request itself (not found, precondition failed...) are not failures of the
   * dependency, and counting them would let one caller open the circuit for everyone.
   */
  isFailure?: (error: unknown) => boolean
}

/**
 * Lightweight circuit breaker: after `failureThreshold` failures in a row the circuit
 * opens and calls fail fast for `resetTimeoutMs`; then it lets `halfOpenMaxProbes` probe
 * calls through at a time (others still fail fast) and closes after
 * `halfOpenSuccesses` successful probes, or opens again on a failed one.
 *
 * Each call belongs to the circuit generation it started in (a new one begins at every
 * state change). A call that finishes in a later generation, such as a slow success that
 * started before the circuit opened, does not change the state.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private generation = 0
  private failures = 0
  private nextAttemptTs = 0
  private halfOpenSuccesses = 0
  private probesInFlight = 0

  constructor(private readonly options: CircuitBreakerOptions) {}

  getState(): CircuitState {
    return this.state
  }

  isOpen(): boolean {
    if (this.state !== 'OPEN') return false
    return Date.now() < this.nextAttemptTs
  }

  /**
   * Execute a function under circuit-breaker protection.
   * Throws immediately when the circuit is open (or its probes are all in use).
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTs) throw this.openError()
      this.enter('HALF_OPEN')
    }

    const probing = this.state === 'HALF_OPEN'
    if (probing) {
      if (this.probesInFlight >= (this.options.halfOpenMaxProbes ?? 1)) throw this.openError()
      this.probesInFlight += 1
    }
    const generation = this.generation

    try {
      const result = await fn()
      if (generation === this.generation) this.onSuccess()
      return result
    } catch (error) {
      if (generation === this.generation) {
        if (this.options.isFailure?.(error) ?? true) this.onFailure()
        else this.onSuccess()
      }
      throw error
    } finally {
      if (probing && generation === this.generation) this.probesInFlight -= 1
    }
  }

  private onSuccess() {
    this.failures = 0
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1
      if (this.halfOpenSuccesses >= (this.options.halfOpenSuccesses ?? 1)) this.enter('CLOSED')
    }
  }

  private onFailure() {
    this.failures += 1
    if (this.state === 'HALF_OPEN' || this.failures >= this.options.failureThreshold) {
      this.enter('OPEN')
    }
  }

  private enter(state: CircuitState) {
    this.state = state
    this.generation += 1
    this.halfOpenSuccesses = 0
    this.probesInFlight = 0
    if (state === 'OPEN') this.nextAttemptTs = Date.now() + this.options.resetTimeoutMs
    if (state === 'CLOSED') this.failures = 0
  }

  private openError() {
    return new Error(
      `Circuit '${this.options.name || 'circuit'}' is open (until ${this.nextAttemptTs})`
    )
  }
}

/**
 * Wrap an async function with a timeout using AbortController.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      try {
        onTimeout?.()
      } catch {
        // A notification must not stop the timeout from rejecting
      }
      reject(new Error(`Operation timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
