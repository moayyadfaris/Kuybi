import { SetMetadata } from '@nestjs/common'

export const ALLOW_PASSWORD_CHANGE_TOKEN_KEY = 'allowPasswordChangeToken'

/**
 * Token scope assigned to the temporary access token issued at login
 * when a user is flagged with forcePasswordChange.
 */
export const PASSWORD_CHANGE_TOKEN_SCOPE = 'password-change'

/**
 * Marks a route as reachable with the temporary password-change token.
 * Every other route guarded by JwtAuthGuard rejects that token.
 *
 * @example
 * @Post('change-password')
 * @UseGuards(JwtAuthGuard)
 * @AllowPasswordChangeToken()
 */
export const AllowPasswordChangeToken = () => SetMetadata(ALLOW_PASSWORD_CHANGE_TOKEN_KEY, true)
