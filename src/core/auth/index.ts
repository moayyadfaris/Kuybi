/**
 * HTTP authentication primitives used by every feature module's controllers.
 *
 * JwtAuthGuard runs the passport strategy named 'jwt', which the auth module registers
 * (modules/auth/strategies/jwt.strategy.ts); the guard itself has no module dependencies.
 */
export {
  ALLOW_PASSWORD_CHANGE_TOKEN_KEY,
  AllowPasswordChangeToken,
  PASSWORD_CHANGE_TOKEN_SCOPE
} from './allow-password-change-token.decorator'
export { GetUser } from './get-user.decorator'
export { JwtAuthGuard } from './jwt-auth.guard'
export { OptionalJwtAuthGuard } from './optional-jwt-auth.guard'
