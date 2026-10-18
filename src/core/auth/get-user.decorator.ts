import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/**
 * GetUser Decorator
 *
 * Extracts the authenticated user from the request.
 * The user is attached to the request by JwtAuthGuard after successful authentication
 * (the auth module's JWT strategy loads the full User entity).
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
  (data: keyof Express.User | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Express.Request>()
    const user = request.user

    // If data is provided, return specific property
    if (data) {
      return user?.[data]
    }

    // Otherwise return full user entity
    return user
  }
)
