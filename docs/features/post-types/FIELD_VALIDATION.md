# Field Validation Service

## Overview

The `FieldValidationService` provides comprehensive validation for all 25 field types in the Dynamic Post Types System. It validates field data against field definitions, checking types, constraints, and field-specific rules.

## Features

- ✅ **25 Field Type Validators**: Complete coverage for all field types
- ✅ **Type Safety**: Validates data types (string, number, boolean, object, array)
- ✅ **Constraint Validation**: Min/max values, lengths, patterns, choices
- ✅ **Field-Specific Rules**: Validation rules unique to each field type
- ✅ **Detailed Error Reporting**: Structured error objects with field context
- ✅ **Batch Validation**: Validates multiple fields in one operation
- ✅ **Automatic Integration**: Used by ContentService for create/update operations

## Architecture

### Service Location

```
src/modules/post-types/services/field-validation.service.ts
```

### Dependencies

- `FieldDefinition` entity - Field metadata and validation rules
- `FieldType` enum - 25 field type constants
- `PinoLogger` - Structured logging

### Exports

```typescript
export interface FieldValidationResult {
  isValid: boolean
  errors: FieldValidationError[]
}

export interface FieldValidationError {
  fieldName: string
  fieldType: FieldType
  errorCode: string
  message: string
  value?: any
  constraint?: any
}
```

## Usage

### Basic Validation

```typescript
import { FieldValidationService } from '@modules/post-types/services'

constructor(
  private readonly fieldValidationService: FieldValidationService
) {}

async validateContent(fieldDefinitions: FieldDefinition[], fieldData: Record<string, any>) {
  const result = await this.fieldValidationService.validateFieldData(
    fieldDefinitions,
    fieldData
  )

  if (!result.isValid) {
    console.error('Validation errors:', result.errors)
    // Handle errors
  }
}
```

### Throw on Validation Failure

```typescript
async createContent(data: any) {
  const fieldDefinitions = await this.getFieldDefinitions()
  
  const result = await this.fieldValidationService.validateFieldData(
    fieldDefinitions,
    data.fieldData
  )
  
  // Throws BadRequestException if validation fails
  this.fieldValidationService.throwIfInvalid(result)
  
  // Continue with content creation
}
```

### Automatic Validation in ContentService

The validation service is automatically called by `ContentService` on create/update:

```typescript
// ContentService.create()
const validationResult = await this.fieldValidationService.validateFieldData(
  fieldDefinitions,
  data.fieldData
)
this.fieldValidationService.throwIfInvalid(validationResult)
```

## Field Type Validators

### Text Fields (7 types)

#### TEXT
**Validations**: minLength, maxLength, pattern

```typescript
// Field Definition
{
  name: 'product_name',
  fieldType: FieldType.TEXT,
  validationRules: {
    minLength: 3,
    maxLength: 100,
    pattern: '^[A-Za-z0-9 ]+$'
  }
}

// Valid: "iPhone 15 Pro"
// Invalid: "ab" (too short), "Product@#$" (pattern mismatch)
```

#### TEXTAREA
**Validations**: minLength, maxLength

```typescript
{
  name: 'description',
  fieldType: FieldType.TEXTAREA,
  validationRules: {
    minLength: 10,
    maxLength: 5000
  }
}
```

#### WYSIWYG
**Validations**: minLength, maxLength (on plain text)

```typescript
{
  name: 'content',
  fieldType: FieldType.WYSIWYG,
  validationRules: {
    minLength: 50,    // Min plain text length
    maxLength: 10000
  }
}

// Strips HTML tags before checking length
```

#### EMAIL
**Validations**: RFC 5322 email format

```typescript
{
  name: 'contact_email',
  fieldType: FieldType.EMAIL,
  validationRules: {}
}

// Valid: "user@example.com"
// Invalid: "not-an-email", "user@", "@example.com"
```

#### URL
**Validations**: Valid URL format, protocol

```typescript
{
  name: 'website',
  fieldType: FieldType.URL,
  validationRules: {
    protocol: ['https', 'http']  // Optional: restrict protocols
  }
}

// Valid: "https://example.com"
// Invalid: "not-a-url", "ftp://example.com" (if protocol restricted)
```

#### TEL
**Validations**: Phone number format, custom pattern

```typescript
{
  name: 'phone',
  fieldType: FieldType.TEL,
  validationRules: {
    pattern: '^\\+?[1-9]\\d{1,14}$'  // Optional: E.164 format
  }
}

// Default accepts: +1-555-123-4567, (555) 123-4567, 5551234567
```

#### CODE
**Validations**: maxLength

```typescript
{
  name: 'custom_css',
  fieldType: FieldType.CODE,
  validationRules: {
    maxLength: 10000
  },
  fieldOptions: {
    language: 'css'  // Informational only
  }
}
```

### Number Fields (2 types)

#### NUMBER
**Validations**: min, max, integer, step

```typescript
{
  name: 'quantity',
  fieldType: FieldType.NUMBER,
  validationRules: {
    min: 0,
    max: 1000,
    integer: true,
    step: 5  // Must be multiple of 5
  }
}

// Valid: 0, 5, 10, 995, 1000
// Invalid: -5 (below min), 7 (not multiple of step), 5.5 (not integer)
```

#### CURRENCY
**Validations**: min, max, decimals

```typescript
{
  name: 'price',
  fieldType: FieldType.CURRENCY,
  validationRules: {
    min: 0,
    max: 999999.99,
    decimals: 2  // Max 2 decimal places
  }
}

// Valid: 0, 19.99, 1000.00
// Invalid: -10 (below min), 19.999 (too many decimals)
```

### Date/Time Fields (3 types)

#### DATE
**Validations**: minDate, maxDate

```typescript
{
  name: 'event_date',
  fieldType: FieldType.DATE,
  validationRules: {
    minDate: 'today',      // Special keyword or YYYY-MM-DD
    maxDate: '2025-12-31'
  }
}

// Valid: "2025-06-15" (if today is before that)
// Invalid: "2024-01-01" (before minDate), "2026-01-01" (after maxDate)
```

#### DATETIME
**Validations**: minDate, maxDate (includes time)

```typescript
{
  name: 'event_start',
  fieldType: FieldType.DATETIME,
  validationRules: {
    minDate: 'today'
  }
}

// Valid: "2025-06-15T14:30:00Z"
// Invalid: "2024-01-01T00:00:00Z"
```

#### TIME
**Validations**: Format (HH:MM or HH:MM:SS)

```typescript
{
  name: 'business_hours_open',
  fieldType: FieldType.TIME,
  validationRules: {}
}

// Valid: "09:00", "14:30:00"
// Invalid: "25:00", "9:00" (missing leading zero)
```

### Selection Fields (5 types)

#### CHECKBOX
**Validations**: Boolean type

```typescript
{
  name: 'terms_accepted',
  fieldType: FieldType.CHECKBOX,
  isRequired: true,
  validationRules: {}
}

// Valid: true, false
// Invalid: "yes", 1, null (if required)
```

#### RADIO
**Validations**: Must be one of choices

```typescript
{
  name: 'shipping_method',
  fieldType: FieldType.RADIO,
  fieldOptions: {
    choices: ['standard', 'express', 'overnight']
  }
}

// Valid: "standard"
// Invalid: "ground" (not in choices)
```

#### SELECT
**Validations**: Must be one of choices, allowOther

```typescript
{
  name: 'country',
  fieldType: FieldType.SELECT,
  fieldOptions: {
    choices: ['US', 'CA', 'UK', 'Other'],
    allowOther: true
  }
}

// Valid: "US", "FR" (if allowOther: true)
// Invalid: "FR" (if allowOther: false)
```

#### MULTISELECT
**Validations**: Array type, choices, min/max selections

```typescript
{
  name: 'tags',
  fieldType: FieldType.MULTISELECT,
  validationRules: {
    min: 1,
    max: 5
  },
  fieldOptions: {
    choices: ['electronics', 'furniture', 'clothing', 'food'],
    allowOther: false
  }
}

// Valid: ["electronics", "clothing"]
// Invalid: [] (below min), ["a", "b", "c", "d", "e", "f"] (above max)
```

#### TOGGLE
**Validations**: Boolean type

```typescript
{
  name: 'is_featured',
  fieldType: FieldType.TOGGLE,
  validationRules: {}
}

// Same as CHECKBOX
```

### Media Fields (4 types)

#### FILE
**Validations**: File URL or metadata, allowedTypes, maxSize

```typescript
{
  name: 'document',
  fieldType: FieldType.FILE,
  fieldOptions: {
    allowedTypes: ['application/pdf', 'application/msword'],
    maxSize: 10485760  // 10MB in bytes
  }
}

// Valid: 
// - "https://s3.amazonaws.com/bucket/file.pdf"
// - { url: "...", mimeType: "application/pdf", size: 5000000 }
// Invalid: 
// - { url: "...", mimeType: "image/jpeg", size: 5000000 } (wrong type)
```

#### IMAGE
**Validations**: File validations + dimensions

```typescript
{
  name: 'product_image',
  fieldType: FieldType.IMAGE,
  fieldOptions: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 5242880,  // 5MB
    minWidth: 800,
    minHeight: 600,
    maxWidth: 4000,
    maxHeight: 3000
  }
}

// Valid: { url: "...", width: 1920, height: 1080, ... }
// Invalid: { url: "...", width: 400, height: 300 } (below min dimensions)
```

#### GALLERY
**Validations**: Array of images, min/max count

```typescript
{
  name: 'product_gallery',
  fieldType: FieldType.GALLERY,
  validationRules: {
    min: 3
  },
  fieldOptions: {
    maxCount: 10,
    allowedTypes: ['image/jpeg', 'image/png']
  }
}

// Valid: [image1, image2, image3, ...]
// Invalid: [image1, image2] (below min count)
```

#### VIDEO
**Validations**: File validations

```typescript
{
  name: 'tutorial_video',
  fieldType: FieldType.VIDEO,
  fieldOptions: {
    allowedTypes: ['video/mp4', 'video/webm'],
    maxSize: 104857600  // 100MB
  }
}
```

### Relationship Fields (3 types)

#### RELATION
**Validations**: UUID format, multiple

```typescript
{
  name: 'related_products',
  fieldType: FieldType.RELATION,
  fieldOptions: {
    targetPostType: 'product',
    multiple: true
  }
}

// Valid: 
// - "123e4567-e89b-12d3-a456-426614174000" (single)
// - ["uuid1", "uuid2", "uuid3"] (multiple)
// Invalid: "not-a-uuid", ["uuid1", "invalid"]
```

#### USER
**Validations**: UUID format (same as RELATION)

```typescript
{
  name: 'assigned_to',
  fieldType: FieldType.USER,
  fieldOptions: {
    roles: ['admin', 'editor'],  // Informational only
    multiple: false
  }
}
```

#### TAXONOMY
**Validations**: UUID format (same as RELATION)

```typescript
{
  name: 'categories',
  fieldType: FieldType.TAXONOMY,
  fieldOptions: {
    taxonomy: 'categories',
    multiple: true
  }
}
```

### Advanced Fields (4 types)

#### COLOR
**Validations**: Hex, RGB, or RGBA format

```typescript
{
  name: 'brand_color',
  fieldType: FieldType.COLOR,
  fieldOptions: {
    format: 'hex'  // 'hex', 'rgb', 'rgba'
  }
}

// Valid (hex): "#FF5733", "#F57"
// Valid (rgb): "rgb(255, 87, 51)"
// Valid (rgba): "rgba(255, 87, 51, 0.8)"
// Invalid: "red", "#GGGGGG"
```

#### JSON
**Validations**: Object or array type, maxDepth

```typescript
{
  name: 'api_response',
  fieldType: FieldType.JSON,
  validationRules: {
    maxDepth: 3  // Max nesting level
  }
}

// Valid: { key: "value" }, [1, 2, 3]
// Invalid: 
// - "string" (not object/array)
// - { a: { b: { c: { d: "too deep" } } } } (exceeds maxDepth)
```

#### REPEATER
**Validations**: Array of objects, min/max items

```typescript
{
  name: 'faq_items',
  fieldType: FieldType.REPEATER,
  validationRules: {
    min: 1,
    max: 20
  },
  fieldOptions: {
    subFields: [
      { name: 'question', type: 'text' },
      { name: 'answer', type: 'textarea' }
    ]
  }
}

// Valid: [{ question: "...", answer: "..." }, ...]
// Invalid: [] (below min), "not an array"
```

#### GROUP
**Validations**: Object type

```typescript
{
  name: 'address',
  fieldType: FieldType.GROUP,
  fieldOptions: {
    subFields: [
      { name: 'street', type: 'text' },
      { name: 'city', type: 'text' },
      { name: 'zip', type: 'text' }
    ]
  }
}

// Valid: { street: "...", city: "...", zip: "..." }
// Invalid: "not an object", [...]
```

## Error Codes

| Error Code | Description | Example |
|------------|-------------|---------|
| `REQUIRED_FIELD_MISSING` | Required field not provided | Field 'email' is required |
| `UNKNOWN_FIELD` | Field not defined in post type | Field 'xyz' is not defined |
| `INVALID_TYPE` | Wrong data type | Field 'age' must be a number |
| `MIN_LENGTH` | String too short | Field 'name' must be at least 3 characters |
| `MAX_LENGTH` | String too long | Field 'name' must be at most 100 characters |
| `PATTERN_MISMATCH` | Doesn't match regex | Field 'code' does not match pattern |
| `INVALID_EMAIL` | Invalid email format | Field 'email' must be a valid email |
| `INVALID_URL` | Invalid URL format | Field 'website' must be a valid URL |
| `INVALID_PHONE` | Invalid phone format | Field 'phone' must be a valid phone number |
| `MIN_VALUE` | Number below minimum | Field 'age' must be at least 18 |
| `MAX_VALUE` | Number above maximum | Field 'age' must be at most 100 |
| `NOT_INTEGER` | Decimal when integer required | Field 'quantity' must be an integer |
| `INVALID_STEP` | Not a multiple of step | Field 'quantity' must be multiple of 5 |
| `INVALID_DECIMALS` | Too many decimal places | Field 'price' must have at most 2 decimals |
| `INVALID_DATE` | Invalid date format | Field 'dob' must be a valid date |
| `MIN_DATE` | Date before minimum | Field 'event_date' must be after 2025-01-01 |
| `MAX_DATE` | Date after maximum | Field 'event_date' must be before 2025-12-31 |
| `INVALID_TIME` | Invalid time format | Field 'time' must be HH:MM format |
| `INVALID_CHOICE` | Not in allowed choices | Field 'size' must be one of: S, M, L |
| `NO_CHOICES` | Field has no choices defined | Field 'size' has no choices |
| `MIN_SELECTIONS` | Too few selections | Field 'tags' must have at least 2 selections |
| `MAX_SELECTIONS` | Too many selections | Field 'tags' must have at most 5 selections |
| `MISSING_FILE_URL` | File metadata missing URL | File must include URL |
| `INVALID_FILE_TYPE` | File type not allowed | Only PDF and DOCX files allowed |
| `FILE_TOO_LARGE` | File exceeds size limit | File must be less than 5MB |
| `IMAGE_TOO_SMALL` | Image below min dimensions | Image must be at least 800x600 |
| `IMAGE_TOO_LARGE` | Image above max dimensions | Image must be at most 4000x3000 |
| `MIN_IMAGES` | Gallery below min count | Gallery must have at least 3 images |
| `MAX_IMAGES` | Gallery above max count | Gallery must have at most 10 images |
| `INVALID_UUID` | Invalid UUID format | Field 'related_id' must be valid UUID |
| `INVALID_COLOR` | Invalid color format | Field 'color' must be hex format |
| `MAX_DEPTH_EXCEEDED` | JSON nesting too deep | JSON depth must be at most 3 |
| `MIN_ITEMS` | Repeater below min items | Repeater must have at least 1 item |
| `MAX_ITEMS` | Repeater above max items | Repeater must have at most 20 items |
| `INVALID_ITEM` | Repeater item wrong type | Repeater items must be objects |
| `VALIDATION_ERROR` | Generic validation error | Validation failed: ... |
| `UNSUPPORTED_FIELD_TYPE` | Field type not implemented | Field type 'xyz' not supported |

## Integration with ContentService

The validation service is automatically integrated into `ContentService`:

### On Create

```typescript
async create(postTypeId: string, data: any, authorId: string) {
  // 1. Validate post type exists
  await this.postTypesService.findOne(postTypeId)

  // 2. Validate field data
  const fieldDefinitions = await this.fieldDefinitionsService.findByPostType(postTypeId)
  const validationResult = await this.fieldValidationService.validateFieldData(
    fieldDefinitions,
    data.fieldData
  )
  this.fieldValidationService.throwIfInvalid(validationResult)

  // 3. Create content
  // ...
}
```

### On Update

```typescript
async update(id: string, data: any, updatedBy: string) {
  const content = await this.findOne(id)

  // Validate if field data is being updated
  if (data.fieldData) {
    const fieldDefinitions = await this.fieldDefinitionsService.findByPostType(
      content.postTypeId
    )
    
    // Merge with existing data for full validation
    const mergedFieldData = {
      ...content.fieldData,
      ...data.fieldData
    }
    
    const validationResult = await this.fieldValidationService.validateFieldData(
      fieldDefinitions,
      mergedFieldData
    )
    this.fieldValidationService.throwIfInvalid(validationResult)
  }

  // Update content
  // ...
}
```

## Testing

### Unit Tests

Location: `src/modules/post-types/services/__tests__/field-validation.service.spec.ts`

Coverage: **25/25 field types (100%)**

```bash
npm run test -- field-validation.service.spec.ts
```

### Test Examples

```typescript
describe('FieldValidationService', () => {
  it('should validate text min length', async () => {
    const fieldDefs = [
      {
        name: 'username',
        fieldType: FieldType.TEXT,
        validationRules: { minLength: 3 }
      }
    ]

    const result = await service.validateFieldData(fieldDefs, { username: 'ab' })
    
    expect(result.isValid).toBe(false)
    expect(result.errors[0].errorCode).toBe('MIN_LENGTH')
  })
})
```

## Best Practices

### 1. Define Clear Validation Rules

```typescript
// ❌ Bad: No validation rules
{
  name: 'email',
  fieldType: FieldType.EMAIL,
  validationRules: {}
}

// ✅ Good: Clear constraints
{
  name: 'email',
  fieldType: FieldType.EMAIL,
  isRequired: true,
  validationRules: {},
  helpText: 'Enter a valid email address'
}
```

### 2. Use Appropriate Field Types

```typescript
// ❌ Bad: Using TEXT for structured data
{
  name: 'price',
  fieldType: FieldType.TEXT,
  validationRules: { pattern: '^\\d+\\.\\d{2}$' }
}

// ✅ Good: Using CURRENCY
{
  name: 'price',
  fieldType: FieldType.CURRENCY,
  validationRules: { min: 0, decimals: 2 }
}
```

### 3. Provide Helpful Error Messages

```typescript
// Field label should be user-friendly
{
  name: 'min_age',           // Database name
  label: 'Minimum Age',      // User-facing label
  fieldType: FieldType.NUMBER,
  validationRules: { min: 18 },
  helpText: 'Must be 18 or older'
}

// Results in: "Field 'Minimum Age' must be at least 18"
```

### 4. Validate Related Data

```typescript
// Use RELATION for foreign keys
{
  name: 'category_id',
  fieldType: FieldType.RELATION,
  fieldOptions: {
    targetPostType: 'category',
    multiple: false
  }
}

// Validates UUID format automatically
```

### 5. Handle Validation Errors Gracefully

```typescript
try {
  await contentService.create(postTypeId, data, authorId)
} catch (error) {
  if (error instanceof BadRequestException) {
    const validationErrors = error.getResponse()['errors']
    // Display errors to user
    validationErrors.forEach(err => {
      console.log(`${err.fieldName}: ${err.message}`)
    })
  }
}
```

## Performance Considerations

1. **Caching**: Field definitions are cached, validation is fast
2. **Async Operations**: All validators are async-ready
3. **Batch Validation**: Validates all fields in one pass
4. **Early Exit**: Stops on first type error per field

## Future Enhancements

- [ ] Custom validator registration
- [ ] Cross-field validation (field A depends on field B)
- [ ] Async validators (e.g., check uniqueness in database)
- [ ] Conditional validation based on other field values
- [ ] Localized error messages
- [ ] JSON Schema validation for complex structures
- [ ] File upload validation (beyond metadata)

## Related Documentation

- [Dynamic Post Types System](../../../docs/planning/DYNAMIC_POST_TYPES_PLAN.md)
- [Field Types Reference](../../enums/field-type.enum.ts)
- [Content Service](./content.service.ts)
- [Field Definitions Service](./field-definitions.service.ts)
