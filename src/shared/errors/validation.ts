import { BadRequestException } from '@nestjs/common'
import { getMetadataStorage, ValidationError } from 'class-validator'

import { ErrorCode } from './error-code'
import { FieldError, fieldError, toErrorCode } from './field-error'

/** class-validator constraints whose name says too little on its own */
const CODE_OF: Record<string, string> = {
  whitelistValidation: 'UNKNOWN_FIELD',
  nestedValidation: 'INVALID_NESTED'
}

/** The arguments of common constraints, named for translations ({ min: 6 }) */
const PARAMS_OF: Record<string, (args: unknown[]) => Record<string, unknown>> = {
  minLength: ([min]) => ({ min }),
  maxLength: ([max]) => ({ max }),
  length: ([min, max]) => ({ min, max }),
  min: ([min]) => ({ min }),
  max: ([max]) => ({ max }),
  arrayMinSize: ([min]) => ({ min }),
  arrayMaxSize: ([max]) => ({ max }),
  isIn: ([values]) => ({ values }),
  isNotIn: ([values]) => ({ values }),
  isEnum: ([, values]) => (Array.isArray(values) ? { values } : {}),
  minDate: ([min]) => ({ min }),
  maxDate: ([max]) => ({ max })
}

/**
 * ValidationPipe's exceptionFactory: a 400 VALIDATION_FAILED whose `errors` has one
 * FieldError per failed constraint, nested objects and arrays included ("/items/0/name"),
 * instead of Nest's list of sentences that did not say which field each was about.
 */
export function validationExceptionFactory(
  validationErrors: ValidationError[]
): BadRequestException {
  const errors = validationErrors.flatMap(error => fieldErrorsOf(error, []))
  return new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message:
      errors.length === 1
        ? errors[0].message
        : `${errors.length} problems with the request; see errors`,
    errors
  })
}

function fieldErrorsOf(error: ValidationError, parent: Array<string | number>): FieldError[] {
  const path = [...parent, ...(error.property === undefined ? [] : [error.property])]
  const own = Object.entries(error.constraints ?? {}).map(([name, message]) =>
    fieldError(path, CODE_OF[name] ?? toErrorCode(name), message, paramsOf(error, name))
  )
  const nested = (error.children ?? []).flatMap(child => fieldErrorsOf(child, path))
  return [...own, ...nested]
}

/** The constraint's arguments, read back from class-validator's metadata */
function paramsOf(error: ValidationError, name: string): Record<string, unknown> | undefined {
  const toParams = PARAMS_OF[name]
  const target = error.target?.constructor
  if (!toParams || !target) return undefined
  const metadata = getMetadataStorage()
    .getTargetValidationMetadatas(target, '', true, false)
    .find(entry => entry.propertyName === error.property && entry.name === name)
  return metadata ? toParams(metadata.constraints ?? []) : undefined
}
