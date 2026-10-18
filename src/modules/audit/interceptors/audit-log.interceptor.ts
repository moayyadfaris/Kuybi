import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { errorProperty } from '@shared/utils/error.util'
import { Request } from 'express'
import { Observable, throwError } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'

import { AUDIT_LOG_KEY, AuditLogMetadata } from '../decorators/audit-log.decorator'
import { AuditStatus } from '../entities/audit-log.entity'
import { AuditService } from '../services/audit.service'

import { redactSensitive } from './audit-redaction'

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

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Get audit log metadata from decorator
    const auditMetadata = this.reflector.get<AuditLogMetadata>(AUDIT_LOG_KEY, context.getHandler())

    // Skip if no audit metadata
    if (!auditMetadata) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse()

    // Extract audit context from request
    const auditContext = this.auditService.createContextFromRequest(request)

    // Express 5 types route params as string | string[] (wildcards); :id is a single segment
    const paramId = request.params?.id
    const routeEntityId = Array.isArray(paramId) ? paramId[0] : paramId

    // Extract entity ID from response or params
    const getEntityId = (result?: unknown): string | undefined => {
      // Try to get from params first (for update/delete operations)
      if (routeEntityId) {
        return routeEntityId
      }

      // Try to get from response (for create operations)
      const id = errorProperty<unknown>(result, 'id')
      if (typeof id === 'string' || typeof id === 'number') {
        return String(id)
      }

      const nestedId = errorProperty<unknown>(errorProperty(result, 'data'), 'id')
      if (typeof nestedId === 'string' || typeof nestedId === 'number') {
        return String(nestedId)
      }

      return undefined
    }

    // Build metadata
    const buildMetadata = (result?: unknown, error?: unknown) => {
      const metadata: Record<string, unknown> = {}

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
        metadata.errorName = errorProperty(error, 'name')
        metadata.errorCode = errorProperty(error, 'code')
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
            entityId: routeEntityId,
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
   * Redact credentials and tokens at any depth before a request body is stored
   */
  private sanitizeBody(body: unknown): unknown {
    return redactSensitive(body)
  }

  /**
   * Redact sensitive values and cap the size of a response before it is stored
   */
  private sanitizeResponse(response: unknown): unknown {
    if (!response) {
      return response
    }

    const redacted = redactSensitive(response)
    const stringified = JSON.stringify(redacted)
    if (stringified.length > 5000) {
      return {
        _truncated: true,
        _originalSize: stringified.length,
        preview: stringified.substring(0, 5000) + '...'
      }
    }

    return redacted
  }
}
