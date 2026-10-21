/**
 * A circuit breaker opens on failures of the dependency, not on answers about the
 * caller's request: S3's 404 (not uploaded yet) or 412 (file changed) must not let one
 * client open the S3 circuit for everyone.
 */
import { CircuitBreaker } from '@shared/utils/resilience'

const clientError = Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } })
const serverError = Object.assign(new Error('InternalError'), {
  $metadata: { httpStatusCode: 500 }
})

describe('CircuitBreaker', () => {
  const failing = (error: Error) => () => Promise.reject(error)

  it('opens after repeated failures', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 })
    for (let i = 0; i < 2; i++) await breaker.exec(failing(serverError)).catch(() => undefined)
    expect(breaker.isOpen()).toBe(true)
  })

  it('ignores errors its isFailure option does not count', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
      isFailure: error => (error as typeof serverError).$metadata?.httpStatusCode !== 404
    })
    for (let i = 0; i < 5; i++) {
      await expect(breaker.exec(failing(clientError))).rejects.toThrow('NotFound')
    }
    expect(breaker.isOpen()).toBe(false)
  })
})
