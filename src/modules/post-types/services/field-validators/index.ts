import { FieldType } from '../../enums/field-type.enum'

import { validateColor, validateGroup, validateJson, validateRepeater } from './advanced.validators'
import {
  validateCheckbox,
  validateMultiselect,
  validateRadio,
  validateSelect,
  validateToggle
} from './choice.validators'
import { validateDate, validateDateTime, validateTime } from './date.validators'
import { validateFile, validateGallery, validateImage, validateVideo } from './media.validators'
import { validateCurrency, validateNumber } from './number.validators'
import { validateRelation, validateTaxonomy, validateUser } from './relation.validators'
import {
  validateCode,
  validateEmail,
  validateTel,
  validateText,
  validateTextarea,
  validateUrl,
  validateWysiwyg
} from './text.validators'
import { FieldValidator } from './types'

export type { FieldValidationError, FieldValidationResult, FieldValidator } from './types'

/**
 * One validator per field type. Typed as a Record over FieldType, so adding a field
 * type without a validator is a compile error rather than a runtime "unsupported" error.
 */
export const FIELD_VALIDATORS: Record<FieldType, FieldValidator> = {
  [FieldType.TEXT]: validateText,
  [FieldType.TEXTAREA]: validateTextarea,
  [FieldType.WYSIWYG]: validateWysiwyg,
  [FieldType.EMAIL]: validateEmail,
  [FieldType.URL]: validateUrl,
  [FieldType.TEL]: validateTel,
  [FieldType.CODE]: validateCode,
  [FieldType.NUMBER]: validateNumber,
  [FieldType.CURRENCY]: validateCurrency,
  [FieldType.DATE]: validateDate,
  [FieldType.DATETIME]: validateDateTime,
  [FieldType.TIME]: validateTime,
  [FieldType.CHECKBOX]: validateCheckbox,
  [FieldType.RADIO]: validateRadio,
  [FieldType.SELECT]: validateSelect,
  [FieldType.MULTISELECT]: validateMultiselect,
  [FieldType.TOGGLE]: validateToggle,
  [FieldType.FILE]: validateFile,
  [FieldType.IMAGE]: validateImage,
  [FieldType.GALLERY]: validateGallery,
  [FieldType.VIDEO]: validateVideo,
  [FieldType.RELATION]: validateRelation,
  [FieldType.USER]: validateUser,
  [FieldType.TAXONOMY]: validateTaxonomy,
  [FieldType.COLOR]: validateColor,
  [FieldType.JSON]: validateJson,
  [FieldType.REPEATER]: validateRepeater,
  [FieldType.GROUP]: validateGroup
}
