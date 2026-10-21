/**
 * A circuit breaker opens on failures of the dependency, not on answers about the
 * caller's request: S3's 404 (not uploaded yet) or 412 (file changed) must not let one
 * client open the S3 circuit for everyone.
 */
import { CircuitBreaker, withTimeout } from '@shared/utils/resilience'

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

describe('CircuitBreaker recovery', () => {
  const deferred = <T = string>() => {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
  const tick = () => new Promise(resolve => setTimeout(resolve, 0))
  const cooldown = () => new Promise(resolve => setTimeout(resolve, 30))
  const breakerTripped = async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 })
    await breaker.exec(() => Promise.reject(new Error('down'))).catch(() => undefined)
    expect(breaker.getState()).toBe('OPEN')
    return breaker
  }

  it('lets one probe through after the cooldown, and fails the others fast', async () => {
    const breaker = await breakerTripped()
    await cooldown()

    const probe = deferred()
    const calls = jest.fn(() => probe.promise)
    const first = breaker.exec(calls)
    const others = await Promise.allSettled(Array.from({ length: 10 }, () => breaker.exec(calls)))

    expect(calls).toHaveBeenCalledTimes(1)
    expect(others.every(result => result.status === 'rejected')).toBe(true)
    probe.resolve('ok')
    await first
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('does not let a call started before the circuit opened decide its recovery', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 })
    const slow = deferred()
    const old = breaker.exec(() => slow.promise) // started while closed
    await breaker.exec(() => Promise.reject(new Error('down'))).catch(() => undefined)
    await cooldown()

    const probe = deferred()
    const recovering = breaker.exec(() => probe.promise)
    slow.resolve('stale success')
    await old
    await tick()
    expect(breaker.getState()).toBe('HALF_OPEN')

    probe.resolve('ok')
    await recovering
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('opens again when the probe fails', async () => {
    const breaker = await breakerTripped()
    await cooldown()
    await breaker.exec(() => Promise.reject(new Error('still down'))).catch(() => undefined)
    expect(breaker.getState()).toBe('OPEN')
  })
})

describe('withTimeout', () => {
  it('still rejects with the timeout when the onTimeout callback throws', async () => {
    const never = () => new Promise<never>(() => undefined)
    await expect(
      withTimeout(never, 20, () => {
        throw new Error('callback failed')
      })
    ).rejects.toThrow(/timed out/)
  })
})
