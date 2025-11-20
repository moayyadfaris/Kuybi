import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { FieldValidationService } from '../field-validation.service'
import { FieldDefinition } from '../../entities/field-definition.entity'
import { FieldType } from '../../enums/field-type.enum'
import { getLoggerToken } from 'nestjs-pino'

describe('FieldValidationService', () => {
  let service: FieldValidationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldValidationService,
        {
          provide: getLoggerToken(FieldValidationService.name),
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
          }
        }
      ]
    }).compile()

    service = module.get<FieldValidationService>(FieldValidationService)
  })

  describe('validateFieldData', () => {
    it('should validate required fields', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'title',
          label: 'Title',
          fieldType: FieldType.TEXT,
          isRequired: true,
          validationRules: {}
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        {}
      )

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].errorCode).toBe('REQUIRED_FIELD_MISSING')
    })

    it('should reject unknown fields', async () => {
      const result = await service.validateFieldData([], { unknownField: 'value' })

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('UNKNOWN_FIELD')
    })

    it('should allow null for non-required fields', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'optional',
          label: 'Optional',
          fieldType: FieldType.TEXT,
          isRequired: false,
          validationRules: {}
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { optional: null }
      )

      expect(result.isValid).toBe(true)
    })
  })

  describe('Text Field Validation', () => {
    it('should validate text type', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'name',
          label: 'Name',
          fieldType: FieldType.TEXT,
          isRequired: true,
          validationRules: {}
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { name: 123 }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('INVALID_TYPE')
    })

    it('should validate min length', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'name',
          label: 'Name',
          fieldType: FieldType.TEXT,
          isRequired: true,
          validationRules: { minLength: 5 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { name: 'abc' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MIN_LENGTH')
    })

    it('should validate max length', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'name',
          label: 'Name',
          fieldType: FieldType.TEXT,
          isRequired: true,
          validationRules: { maxLength: 10 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { name: 'this is too long' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MAX_LENGTH')
    })

    it('should validate pattern', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'code',
          label: 'Code',
          fieldType: FieldType.TEXT,
          isRequired: true,
          validationRules: { pattern: '^[A-Z]{3}$' }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { code: 'abc' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('PATTERN_MISMATCH')
    })
  })

  describe('Email Field Validation', () => {
    it('should validate email format', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'email',
          label: 'Email',
          fieldType: FieldType.EMAIL,
          isRequired: true,
          validationRules: {}
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { email: 'notanemail' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_EMAIL')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { email: 'test@example.com' }
      )

      expect(valid.isValid).toBe(true)
    })
  })

  describe('Number Field Validation', () => {
    it('should validate number type', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'age',
          label: 'Age',
          fieldType: FieldType.NUMBER,
          isRequired: true,
          validationRules: {}
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { age: 'not a number' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('INVALID_TYPE')
    })

    it('should validate min value', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'age',
          label: 'Age',
          fieldType: FieldType.NUMBER,
          isRequired: true,
          validationRules: { min: 18 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { age: 16 }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MIN_VALUE')
    })

    it('should validate max value', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'age',
          label: 'Age',
          fieldType: FieldType.NUMBER,
          isRequired: true,
          validationRules: { max: 100 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { age: 150 }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MAX_VALUE')
    })

    it('should validate integer constraint', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'count',
          label: 'Count',
          fieldType: FieldType.NUMBER,
          isRequired: true,
          validationRules: { integer: true }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { count: 5.5 }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('NOT_INTEGER')
    })
  })

  describe('Date Field Validation', () => {
    it('should validate date format', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'birthdate',
          label: 'Birth Date',
          fieldType: FieldType.DATE,
          isRequired: true,
          validationRules: {}
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { birthdate: 'not a date' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_DATE')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { birthdate: '2025-01-01' }
      )

      expect(valid.isValid).toBe(true)
    })

    it('should validate min date', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'event_date',
          label: 'Event Date',
          fieldType: FieldType.DATE,
          isRequired: true,
          validationRules: { minDate: '2025-01-01' }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { event_date: '2024-12-31' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MIN_DATE')
    })
  })

  describe('Select Field Validation', () => {
    it('should validate choices', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'size',
          label: 'Size',
          fieldType: FieldType.SELECT,
          isRequired: true,
          validationRules: {},
          fieldOptions: { choices: ['S', 'M', 'L', 'XL'] }
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { size: 'XXL' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_CHOICE')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { size: 'M' }
      )

      expect(valid.isValid).toBe(true)
    })
  })

  describe('Multiselect Field Validation', () => {
    it('should validate array type', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'tags',
          label: 'Tags',
          fieldType: FieldType.MULTISELECT,
          isRequired: true,
          validationRules: {},
          fieldOptions: { choices: ['tag1', 'tag2', 'tag3'] }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { tags: 'not an array' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('INVALID_TYPE')
    })

    it('should validate min selections', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'tags',
          label: 'Tags',
          fieldType: FieldType.MULTISELECT,
          isRequired: true,
          validationRules: { min: 2 },
          fieldOptions: { choices: ['tag1', 'tag2', 'tag3'] }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { tags: ['tag1'] }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MIN_SELECTIONS')
    })

    it('should validate max selections', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'tags',
          label: 'Tags',
          fieldType: FieldType.MULTISELECT,
          isRequired: true,
          validationRules: { max: 2 },
          fieldOptions: { choices: ['tag1', 'tag2', 'tag3'] }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { tags: ['tag1', 'tag2', 'tag3'] }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MAX_SELECTIONS')
    })
  })

  describe('Relation Field Validation', () => {
    it('should validate UUID format', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'related_product',
          label: 'Related Product',
          fieldType: FieldType.RELATION,
          isRequired: true,
          validationRules: {},
          fieldOptions: { targetPostType: 'product', multiple: false }
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { related_product: 'not-a-uuid' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_UUID')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { related_product: '123e4567-e89b-12d3-a456-426614174000' }
      )

      expect(valid.isValid).toBe(true)
    })

    it('should validate multiple UUIDs', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'related_products',
          label: 'Related Products',
          fieldType: FieldType.RELATION,
          isRequired: true,
          validationRules: {},
          fieldOptions: { targetPostType: 'product', multiple: true }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        {
          related_products: ['123e4567-e89b-12d3-a456-426614174000', 'invalid-uuid']
        }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('INVALID_UUID')
    })
  })

  describe('Color Field Validation', () => {
    it('should validate hex color format', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'brand_color',
          label: 'Brand Color',
          fieldType: FieldType.COLOR,
          isRequired: true,
          validationRules: {},
          fieldOptions: { format: 'hex' }
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { brand_color: 'red' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_COLOR')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { brand_color: '#FF5733' }
      )

      expect(valid.isValid).toBe(true)
    })
  })

  describe('JSON Field Validation', () => {
    it('should validate object type', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'metadata',
          label: 'Metadata',
          fieldType: FieldType.JSON,
          isRequired: true,
          validationRules: {}
        }
      ]

      const invalid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { metadata: 'not an object' }
      )

      expect(invalid.isValid).toBe(false)
      expect(invalid.errors[0].errorCode).toBe('INVALID_TYPE')

      const valid = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { metadata: { key: 'value' } }
      )

      expect(valid.isValid).toBe(true)
    })

    it('should validate max depth', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'metadata',
          label: 'Metadata',
          fieldType: FieldType.JSON,
          isRequired: true,
          validationRules: { maxDepth: 2 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        {
          metadata: {
            level1: {
              level2: {
                level3: 'too deep'
              }
            }
          }
        }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MAX_DEPTH_EXCEEDED')
    })
  })

  describe('Repeater Field Validation', () => {
    it('should validate array type', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'faq_items',
          label: 'FAQ Items',
          fieldType: FieldType.REPEATER,
          isRequired: true,
          validationRules: {}
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { faq_items: 'not an array' }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('INVALID_TYPE')
    })

    it('should validate min items', async () => {
      const fieldDefs: Partial<FieldDefinition>[] = [
        {
          name: 'faq_items',
          label: 'FAQ Items',
          fieldType: FieldType.REPEATER,
          isRequired: true,
          validationRules: { min: 2 }
        }
      ]

      const result = await service.validateFieldData(
        fieldDefs as FieldDefinition[],
        { faq_items: [{ question: 'Q1', answer: 'A1' }] }
      )

      expect(result.isValid).toBe(false)
      expect(result.errors[0].errorCode).toBe('MIN_ITEMS')
    })
  })

  describe('throwIfInvalid', () => {
    it('should throw BadRequestException if validation fails', () => {
      const result = {
        isValid: false,
        errors: [
          {
            fieldName: 'test',
            fieldType: FieldType.TEXT,
            errorCode: 'TEST_ERROR',
            message: 'Test error message'
          }
        ]
      }

      expect(() => service.throwIfInvalid(result)).toThrow(BadRequestException)
    })

    it('should not throw if validation passes', () => {
      const result = {
        isValid: true,
        errors: []
      }

      expect(() => service.throwIfInvalid(result)).not.toThrow()
    })
  })
})
