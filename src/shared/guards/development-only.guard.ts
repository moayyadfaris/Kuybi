import { CanActivate, Injectable, NotFoundException } from '@nestjs/common'

/**
 * Hides diagnostic endpoints outside local development.
 *
 * Checked per request (not at module load, which runs before .env is read), and answers
 * 404 so production does not even reveal that the route exists.
 */
@Injectable()
export class DevelopmentOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV !== 'development') {
      throw new NotFoundException()
    }
    return true
  }
}
