import { User } from '@modules/users/entities'

export type LoginFailureReason =
  'user_not_found' | 'invalid_password' | 'account_locked' | 'user_inactive'

/** Why a login was refused, and the account it was for when the email matched one */
export interface LoginFailure {
  reason: LoginFailureReason
  user?: Pick<User, 'id' | 'email' | 'name'>
}
