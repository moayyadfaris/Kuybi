import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { User } from '@modules/users/entities/user.entity'

/**
 * GetUser Decorator
 *
 * Extracts the authenticated user from the request.
 * The user is attached to the request by JwtAuthGuard after successful authentication.
 *
 * Usage:
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * async getProfile(@GetUser() user: User) {
 *   return user;
 * }
 *
 * // Get specific property
 * @Post('content')
 * @UseGuards(JwtAuthGuard)
 * async create(@GetUser('id') userId: string) {
 *   // Use userId
 * }
 * ```
 */
export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): User | string => {
    const request = ctx.switchToHttp().getRequest()
    const user = request.user as User

    // If data is provided, return specific property
    if (data) {
      return user?.[data]
    }

    // Otherwise return full user entity
    return user
  }
)
