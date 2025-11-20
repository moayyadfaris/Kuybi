# Field Validation Quick Reference

## Import

```typescript
import { FieldValidationService } from '@modules/post-types/services'
```

## Basic Usage

```typescript
// In your service
constructor(
  private readonly fieldValidationService: FieldValidationService
) {}

// Validate field data
const result = await this.fieldValidationService.validateFieldData(
  fieldDefinitions,
  fieldData
)

// Throw if invalid
this.fieldValidationService.throwIfInvalid(result)
```

## Validation Rules by Field Type

| Field Type | Validation Rules | Example |
|------------|------------------|---------|
| **TEXT** | `minLength`, `maxLength`, `pattern` | `{ minLength: 3, maxLength: 100 }` |
| **TEXTAREA** | `minLength`, `maxLength` | `{ maxLength: 5000 }` |
| **WYSIWYG** | `minLength`, `maxLength` (plain text) | `{ minLength: 50 }` |
| **EMAIL** | Email format (RFC 5322) | `{}` |
| **URL** | Valid URL, `protocol` | `{ protocol: ['https', 'http'] }` |
| **TEL** | Phone format, `pattern` | `{ pattern: '^\\+?[1-9]\\d{1,14}$' }` |
| **CODE** | `maxLength` | `{ maxLength: 10000 }` |
| **NUMBER** | `min`, `max`, `integer`, `step` | `{ min: 0, max: 100, integer: true }` |
| **CURRENCY** | `min`, `max`, `decimals` | `{ min: 0, decimals: 2 }` |
| **DATE** | `minDate`, `maxDate` | `{ minDate: 'today', maxDate: '2025-12-31' }` |
| **DATETIME** | `minDate`, `maxDate` | `{ minDate: 'today' }` |
| **TIME** | HH:MM format | `{}` |
| **CHECKBOX** | Boolean type | `{}` |
| **RADIO** | `choices` (fieldOptions) | `{ choices: ['S', 'M', 'L'] }` |
| **SELECT** | `choices`, `allowOther` | `{ choices: [...], allowOther: true }` |
| **MULTISELECT** | `choices`, `min`, `max` | `{ min: 1, max: 5 }` |
| **TOGGLE** | Boolean type | `{}` |
| **FILE** | `allowedTypes`, `maxSize` | `{ allowedTypes: ['application/pdf'], maxSize: 10485760 }` |
| **IMAGE** | File + `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `{ minWidth: 800, minHeight: 600 }` |
| **GALLERY** | `min`, `maxCount` | `{ min: 3, maxCount: 10 }` |
| **VIDEO** | `allowedTypes`, `maxSize` | `{ maxSize: 104857600 }` |
| **RELATION** | UUID format, `multiple` | `{ targetPostType: 'product', multiple: true }` |
| **USER** | UUID format, `multiple` | `{ roles: ['admin'], multiple: false }` |
| **TAXONOMY** | UUID format, `multiple` | `{ taxonomy: 'categories', multiple: true }` |
| **COLOR** | `format` (hex/rgb/rgba) | `{ format: 'hex' }` |
| **JSON** | `maxDepth` | `{ maxDepth: 3 }` |
| **REPEATER** | `min`, `max` | `{ min: 1, max: 20 }` |
| **GROUP** | Object type | `{}` |

## Common Error Codes

| Code | Meaning |
|------|---------|
| `REQUIRED_FIELD_MISSING` | Required field not provided |
| `UNKNOWN_FIELD` | Field not in definition |
| `INVALID_TYPE` | Wrong data type |
| `MIN_LENGTH` / `MAX_LENGTH` | String length violation |
| `PATTERN_MISMATCH` | Regex doesn't match |
| `MIN_VALUE` / `MAX_VALUE` | Number out of range |
| `INVALID_EMAIL` | Invalid email format |
| `INVALID_URL` | Invalid URL format |
| `INVALID_DATE` | Invalid date format |
| `INVALID_CHOICE` | Not in allowed choices |
| `MIN_SELECTIONS` / `MAX_SELECTIONS` | Selection count violation |
| `FILE_TOO_LARGE` | File exceeds maxSize |
| `INVALID_UUID` | Invalid UUID format |

## Error Response Structure

```typescript
{
  isValid: boolean
  errors: [{
    fieldName: string
    fieldType: FieldType
    errorCode: string
    message: string
    value?: any
    constraint?: any
  }]
}
```

## Field Definition Example

```typescript
{
  name: 'email',
  label: 'Email Address',
  fieldType: FieldType.EMAIL,
  isRequired: true,
  validationRules: {},
  helpText: 'Enter a valid email address'
}
```

## Full Example

```typescript
// Define fields
const fieldDefinitions = [
  {
    name: 'product_name',
    label: 'Product Name',
    fieldType: FieldType.TEXT,
    isRequired: true,
    validationRules: {
      minLength: 3,
      maxLength: 100
    }
  },
  {
    name: 'price',
    label: 'Price',
    fieldType: FieldType.CURRENCY,
    isRequired: true,
    validationRules: {
      min: 0,
      decimals: 2
    }
  },
  {
    name: 'categories',
    label: 'Categories',
    fieldType: FieldType.MULTISELECT,
    isRequired: true,
    validationRules: {
      min: 1,
      max: 5
    },
    fieldOptions: {
      choices: ['electronics', 'furniture', 'clothing']
    }
  }
]

// Validate data
const fieldData = {
  product_name: 'iPhone 15',
  price: 999.99,
  categories: ['electronics']
}

const result = await fieldValidationService.validateFieldData(
  fieldDefinitions,
  fieldData
)

if (result.isValid) {
  console.log('✅ Validation passed')
} else {
  console.log('❌ Validation failed:')
  result.errors.forEach(err => {
    console.log(`  - ${err.fieldName}: ${err.message}`)
  })
}
```

## Tips

1. **Always use labels**: They appear in error messages
2. **Set isRequired**: Don't rely only on validationRules
3. **Use appropriate types**: CURRENCY not TEXT for money
4. **Provide helpText**: Guide users on format
5. **Test edge cases**: Min/max boundaries, nulls, wrong types

## Documentation

- Full docs: `docs/features/post-types/FIELD_VALIDATION.md`
- Source code: `src/modules/post-types/services/field-validation.service.ts`
- Tests: `src/modules/post-types/services/__tests__/field-validation.service.spec.ts`
