import { NotFoundException } from '@nestjs/common'
import { DevelopmentOnlyGuard } from '@shared/guards/development-only.guard'

describe('DevelopmentOnlyGuard', () => {
  const original = process.env.NODE_ENV
  afterEach(() => {
    process.env.NODE_ENV = original
  })

  it.each(['production', 'staging', 'test', undefined])('answers 404 when NODE_ENV=%s', env => {
    if (env === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = env

    expect(() => new DevelopmentOnlyGuard().canActivate()).toThrow(NotFoundException)
  })

  it('allows the request in local development', () => {
    process.env.NODE_ENV = 'development'

    expect(new DevelopmentOnlyGuard().canActivate()).toBe(true)
  })
})
