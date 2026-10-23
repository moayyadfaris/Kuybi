import type { OpenAPIObject } from '@nestjs/swagger'
import { ErrorCode, PROBLEM_CONTENT_TYPE } from '@shared/errors'

type Schema = Record<string, unknown>

const FIELD_ERROR: Schema = {
  type: 'object',
  required: ['pointer', 'field', 'code', 'message'],
  properties: {
    pointer: { type: 'string', example: '/address/city', description: 'JSON Pointer (RFC 6901)' },
    field: { type: 'string', example: 'address.city' },
    code: { type: 'string', example: 'MIN_LENGTH' },
    message: { type: 'string', example: 'city must be longer than or equal to 2 characters' },
    params: { type: 'object', example: { min: 2 }, additionalProperties: true }
  }
}

const PROBLEM: Schema = {
  type: 'object',
  description:
    'RFC 9457 problem details. Branch on `code` and translate it (with `errors[].code` and ' +
    '`params`); `detail` is English and for fallback display only.',
  required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'requestId', 'timestamp'],
  properties: {
    type: { type: 'string', example: 'urn:kuybi:problem:validation-failed' },
    title: { type: 'string', example: 'The request has invalid fields' },
    status: { type: 'integer', example: 400 },
    detail: { type: 'string', example: 'email must be an email' },
    instance: { type: 'string', example: '/api/v1/auth/login' },
    code: { type: 'string', enum: Object.values(ErrorCode), example: 'VALIDATION_FAILED' },
    requestId: { type: 'string', example: 'c661be85-366c-489d-b9e2-dca7b500f5dc' },
    timestamp: { type: 'string', format: 'date-time' },
    errors: { type: 'array', items: { $ref: '#/components/schemas/FieldError' } },
    details: { description: 'Data specific to the code', additionalProperties: true }
  }
}

const PROBLEM_CONTENT = {
  [PROBLEM_CONTENT_TYPE]: { schema: { $ref: '#/components/schemas/ProblemDetails' } }
}

/**
 * Documents the error contract: the ProblemDetails and FieldError schemas, and on every
 * operation, its 4xx/5xx responses (or a default 4XX and 5XX) as application/problem+json.
 */
export function addProblemResponses(document: OpenAPIObject): OpenAPIObject {
  document.components = document.components ?? {}
  document.components.schemas = {
    ...document.components.schemas,
    FieldError: FIELD_ERROR,
    ProblemDetails: PROBLEM
  }

  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue
      const responses = (operation as { responses: Record<string, Record<string, unknown>> })
        .responses
      for (const [status, response] of Object.entries(responses)) {
        if (/^[45]/.test(status)) response.content = PROBLEM_CONTENT
      }
      responses['4XX'] ??= { description: 'Client error', content: PROBLEM_CONTENT }
      responses['5XX'] ??= { description: 'Server error', content: PROBLEM_CONTENT }
    }
  }
  return document
}
