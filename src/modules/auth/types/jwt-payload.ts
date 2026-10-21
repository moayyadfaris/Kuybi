/** Claims of the access tokens issued by AuthService and verified by JwtStrategy */
export interface AccessTokenPayload {
  /** user id */
  sub: string
  email: string
  role: string
  /** Session the token belongs to. Absent only on temporary password-change tokens. */
  sid?: string
  /** Limited token issued when a password change is forced (no session yet) */
  tempPasswordChange?: boolean
  /** users.credentialsVersion when issued; absent on tokens from before the claim (= 0) */
  cv?: number
  /** Issued at (seconds), set by the JWT library */
  iat?: number
}
