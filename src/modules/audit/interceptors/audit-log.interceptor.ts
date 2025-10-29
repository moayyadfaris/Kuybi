import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, throwError } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import { Request } from 'express'
import { AuditService } from '../services/audit.service'
import { AUDIT_LOG_KEY, AuditLogMetadata } from '../decorators/audit-log.decorator'
import { AuditStatus } from '../entities/audit-log.entity'

/**
 * Interceptor to automatically create audit logs based on @AuditLog decorator
 *
 * This interceptor:
 * 1. Extracts metadata from @AuditLog decorator
 * 2. Captures request context (user, IP, user-agent, etc.)
 * 3. Logs successful operations after execution
 * 4. Logs failed operations with error details
 * 5. Can optionally include request body and response
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Get audit log metadata from decorator
    const auditMetadata = this.reflector.get<AuditLogMetadata>(AUDIT_LOG_KEY, context.getHandler())

    // Skip if no audit metadata
    if (!auditMetadata) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest<Request & { user?: any }>()
    const response = context.switchToHttp().getResponse()

    // Extract audit context from request
    const auditContext = this.auditService.createContextFromRequest(request)

    // Extract entity ID from response or params
    const getEntityId = (result?: any): string | undefined => {
      // Try to get from params first (for update/delete operations)
      if (request.params?.id) {
        return request.params.id
      }

      // Try to get from response (for create operations)
      if (result?.id) {
        return result.id
      }

      if (result?.data?.id) {
        return result.data.id
      }

      return undefined
    }

    // Build metadata
    const buildMetadata = (result?: any, error?: any) => {
      const metadata: Record<string, any> = {}

      if (auditMetadata.includeBody && request.body) {
        metadata.requestBody = this.sanitizeBody(request.body)
      }

      if (auditMetadata.includeResponse && result) {
        metadata.response = this.sanitizeResponse(result)
      }

      if (request.params) {
        metadata.params = request.params
      }

      if (request.query && Object.keys(request.query).length > 0) {
        metadata.query = request.query
      }

      if (error) {
        metadata.errorName = error.name
        metadata.errorCode = error.code
      }

      return metadata
    }

    return next.handle().pipe(
      // Log successful operation
      tap(async result => {
        try {
          await this.auditService.logAction(auditContext, {
            action: auditMetadata.action,
            entityType: auditMetadata.entityType,
            entityId: getEntityId(result),
            description: auditMetadata.description,
            status: AuditStatus.SUCCESS,
            statusCode: response.statusCode,
            metadata: buildMetadata(result)
          })
        } catch (error) {
          // Don't fail the request if audit logging fails
          console.error('Failed to create audit log:', error)
        }
      }),
      // Log failed operation
      catchError(error => {
        // Log the error asynchronously
        this.auditService
          .logAction(auditContext, {
            action: auditMetadata.action,
            entityType: auditMetadata.entityType,
            entityId: request.params?.id,
            description: auditMetadata.description || `Failed: ${error.message}`,
            status: AuditStatus.FAILURE,
            statusCode: error.status || 500,
            errorMessage: error.message,
            errorStack: error.stack,
            metadata: buildMetadata(undefined, error)
          })
          .catch(auditError => {
            console.error('Failed to create audit log for error:', auditError)
          })

        // Re-throw the original error
        return throwError(() => error)
      })
    )
  }

  /**
   * Sanitize request body by removing sensitive fields
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body
    }

    const sanitized = { ...body }
    const sensitiveFields = [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'creditCard',
      'cvv'
    ]

    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]'
      }
    })

    return sanitized
  }

  /**
   * Sanitize response by limiting size and removing sensitive data
   */
  private sanitizeResponse(response: any): any {
    if (!response) {
      return response
    }

    // Limit response size to prevent huge audit logs
    const stringified = JSON.stringify(response)
    if (stringified.length > 5000) {
      return {
        _truncated: true,
        _originalSize: stringified.length,
        preview: stringified.substring(0, 5000) + '...'
      }
    }

    return response
  }
}
