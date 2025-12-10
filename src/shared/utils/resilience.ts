export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  name?: string
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenSuccesses?: number
}

/**
 * Lightweight circuit breaker + timeout helpers to protect outbound calls.
 * Keep intentionally simple to avoid heavy dependencies while still preventing cascades.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private nextAttemptTs = 0
  private halfOpenSuccesses = 0

  constructor(private readonly options: CircuitBreakerOptions) {}

  isOpen(): boolean {
    if (this.state !== 'OPEN') return false
    return Date.now() < this.nextAttemptTs
  }

  /**
   * Execute a function under circuit-breaker protection.
   * Throws immediately when the circuit is open and cooldown has not elapsed.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()

    if (this.state === 'OPEN') {
      if (now < this.nextAttemptTs) {
        throw new Error(
          `Circuit '${this.options.name || 'circuit'}' is open (until ${
            this.nextAttemptTs
          })`
        )
      }
      this.state = 'HALF_OPEN'
      this.halfOpenSuccesses = 0
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1
      const target = this.options.halfOpenSuccesses ?? 1
      if (this.halfOpenSuccesses >= target) {
        this.state = 'CLOSED'
        this.halfOpenSuccesses = 0
      }
    }
  }

  private onFailure() {
    this.failures += 1
    if (this.state === 'HALF_OPEN' || this.failures >= this.options.failureThreshold) {
      this.trip()
    }
  }

  private trip() {
    this.state = 'OPEN'
    this.nextAttemptTs = Date.now() + this.options.resetTimeoutMs
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
      onTimeout?.()
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
