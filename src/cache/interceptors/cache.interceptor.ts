import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { Observable, of } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Reflector } from '@nestjs/core'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CACHE_KEY_METADATA, CACHE_TTL_METADATA } from '../decorators/cache-key.decorator'

/**
 * Enhanced Cache Interceptor
 * 
 * Automatically caches method responses based on request parameters
 * Supports custom cache keys and TTLs via decorators
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private reflector: Reflector,
    @InjectPinoLogger(HttpCacheInterceptor.name) private readonly logger: PinoLogger
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest()
    const method = request.method
    
    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle()
    }

    // Build cache key
    const cacheKeyTemplate = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    )
    
    const cacheKey = cacheKeyTemplate
      ? this.buildCacheKey(cacheKeyTemplate, request)
      : this.generateCacheKey(request)

    // Get custom TTL if specified
    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    )

    try {
      const cachedResponse = await this.cacheManager.get(cacheKey)
      
      if (cachedResponse) {
        // Add cache hit header
        const response = context.switchToHttp().getResponse()
        response.setHeader('X-Cache-Hit', 'true')
        return of(cachedResponse)
      }

      return next.handle().pipe(
        tap(async (response) => {
          try {
            await this.cacheManager.set(cacheKey, response, ttl)
          } catch (error) {
            this.logger.error({ msg: 'Failed to cache response', cacheKey, error: error.message })
          }
        }),
      )
    } catch (error) {
      this.logger.error({ msg: 'Cache error, bypassing cache', cacheKey, error: error.message })
      return next.handle()
    }
  }

  private buildCacheKey(template: string, request: any): string {
    // Replace placeholders in template with actual values
    let key = template
    const params = { ...request.params, ...request.query }
    
    for (const [paramKey, value] of Object.entries(params)) {
      key = key.replace(`{${paramKey}}`, String(value))
    }
    
    return key
  }

  private generateCacheKey(request: any): string {
    const url = request.url
    const query = JSON.stringify(request.query || {})
    return `cache:${url}:${query}`
  }
}
