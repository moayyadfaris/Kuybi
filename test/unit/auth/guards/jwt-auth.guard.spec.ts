import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import {
  ALLOW_PASSWORD_CHANGE_TOKEN_KEY,
  AllowPasswordChangeToken,
  PASSWORD_CHANGE_TOKEN_SCOPE
} from '@core/auth/allow-password-change-token.decorator'
import { JwtAuthGuard } from '@core/auth/jwt-auth.guard'

describe('JwtAuthGuard', () => {
  const user = { id: 'user-1' }

  class OpenController {
    regularRoute() {}

    @AllowPasswordChangeToken()
    changePassword() {}
  }

  const contextFor = (handler: () => void, request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => OpenController
    }) as unknown as ExecutionContext

  let guard: JwtAuthGuard

  beforeEach(() => {
    guard = new JwtAuthGuard(new Reflector())
  })

  it('passes a regular access token through to any route', () => {
    const context = contextFor(OpenController.prototype.regularRoute, {})

    expect(guard.handleRequest(null, user, undefined, context)).toBe(user)
  })

  it('rejects the password-change token on routes without the decorator', () => {
    const context = contextFor(OpenController.prototype.regularRoute, {
      tokenScope: PASSWORD_CHANGE_TOKEN_SCOPE
    })

    expect(() => guard.handleRequest(null, user, undefined, context)).toThrow(ForbiddenException)
  })

  it('accepts the password-change token on routes marked @AllowPasswordChangeToken', () => {
    const context = contextFor(OpenController.prototype.changePassword, {
      tokenScope: PASSWORD_CHANGE_TOKEN_SCOPE
    })

    expect(guard.handleRequest(null, user, undefined, context)).toBe(user)
  })

  it('still rejects unauthenticated requests', () => {
    const context = contextFor(OpenController.prototype.changePassword, {})

    expect(() => guard.handleRequest(null, false, undefined, context)).toThrow()
  })

  it('stores the opt-in flag under the expected metadata key', () => {
    expect(
      Reflect.getMetadata(ALLOW_PASSWORD_CHANGE_TOKEN_KEY, OpenController.prototype.changePassword)
    ).toBe(true)
  })
})
