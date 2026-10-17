import { PinoLogger } from 'nestjs-pino'

import { FieldDefinition } from '@modules/post-types/entities/field-definition.entity'
import { FieldType } from '@modules/post-types/enums/field-type.enum'
import { FieldValidationService } from '@modules/post-types/services/field-validation.service'

/**
 * Behaviour of the individual field validators that the original spec did not cover.
 * Each case validates one field and asserts the resulting error codes ([] = valid).
 */
describe('FieldValidationService validators', () => {
  const service = new FieldValidationService({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  } as unknown as PinoLogger)

  const codesFor = async (
    fieldType: FieldType,
    value: unknown,
    validationRules: Record<string, unknown> = {},
    fieldOptions: Record<string, unknown> = {}
  ) => {
    const field = {
      name: 'f',
      label: 'F',
      fieldType,
      isRequired: false,
      validationRules,
      fieldOptions
    } as unknown as FieldDefinition
    const result = await service.validateFieldData([field], { f: value })
    return result.errors.map(e => e.errorCode)
  }

  describe('url', () => {
    it.each([['https://example.com/page'], ['http://localhost:3000/a?b=c']])(
      'accepts %s',
      async value => {
        expect(await codesFor(FieldType.URL, value)).toEqual([])
      }
    )

    // Without an explicit protocol rule these would be stored and rendered as links
    it.each([
      ['javascript:alert(document.cookie)'],
      ['JavaScript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['vbscript:msgbox(1)']
    ])('rejects the executable scheme in %s by default', async value => {
      expect(await codesFor(FieldType.URL, value)).toEqual(['INVALID_PROTOCOL'])
    })

    it('honours an explicit protocol rule', async () => {
      expect(
        await codesFor(FieldType.URL, 'ftp://files.example.com', { protocol: ['ftp'] })
      ).toEqual([])
      expect(await codesFor(FieldType.URL, 'https://example.com', { protocol: 'ftp' })).toEqual([
        'INVALID_PROTOCOL'
      ])
    })

    it('rejects malformed URLs and non-strings', async () => {
      expect(await codesFor(FieldType.URL, 'not a url')).toEqual(['INVALID_URL'])
      expect(await codesFor(FieldType.URL, 42)).toEqual(['INVALID_TYPE'])
    })
  })

  describe('number step', () => {
    it.each([
      [0.3, 0.1],
      [1.2, 0.2],
      [10, 2.5],
      [15, 5]
    ])('accepts %p as a multiple of step %p', async (value, step) => {
      expect(await codesFor(FieldType.NUMBER, value, { step })).toEqual([])
    })

    it.each([
      [0.35, 0.1],
      [7, 5]
    ])('rejects %p as not a multiple of step %p', async (value, step) => {
      expect(await codesFor(FieldType.NUMBER, value, { step })).toEqual(['INVALID_STEP'])
    })
  })

  describe('text-like fields', () => {
    it('textarea follows the text rules', async () => {
      expect(await codesFor(FieldType.TEXTAREA, 'ab', { minLength: 3 })).toEqual(['MIN_LENGTH'])
      expect(await codesFor(FieldType.TEXTAREA, 'abc', { minLength: 3 })).toEqual([])
    })

    it('wysiwyg measures length on text with tags stripped', async () => {
      expect(await codesFor(FieldType.WYSIWYG, '<p>hi</p>', { minLength: 3 })).toEqual([
        'MIN_LENGTH'
      ])
      expect(await codesFor(FieldType.WYSIWYG, '<p>hello</p>', { maxLength: 5 })).toEqual([])
      expect(await codesFor(FieldType.WYSIWYG, 5)).toEqual(['INVALID_TYPE'])
    })

    it('code enforces maxLength', async () => {
      expect(await codesFor(FieldType.CODE, 'x'.repeat(11), { maxLength: 10 })).toEqual([
        'MAX_LENGTH'
      ])
      expect(await codesFor(FieldType.CODE, 'const a = 1')).toEqual([])
    })

    it.each([['+962 79 123 4567'], ['(06) 555-1234'], ['0791234567']])(
      'tel accepts %s',
      async value => {
        expect(await codesFor(FieldType.TEL, value)).toEqual([])
      }
    )

    it('tel rejects letters and honours a custom pattern', async () => {
      expect(await codesFor(FieldType.TEL, 'call me')).toEqual(['INVALID_PHONE'])
      expect(await codesFor(FieldType.TEL, '12345', { pattern: '^\\d{6}$' })).toEqual([
        'INVALID_PHONE'
      ])
    })
  })

  describe('currency', () => {
    it('defaults to two decimal places', async () => {
      expect(await codesFor(FieldType.CURRENCY, 10.25)).toEqual([])
      expect(await codesFor(FieldType.CURRENCY, 10.255)).toEqual(['INVALID_DECIMALS'])
    })

    it('accepts numeric strings and enforces min/max', async () => {
      expect(await codesFor(FieldType.CURRENCY, '99.5', { min: 0, max: 100 })).toEqual([])
      expect(await codesFor(FieldType.CURRENCY, -1, { min: 0 })).toEqual(['MIN_VALUE'])
      expect(await codesFor(FieldType.CURRENCY, 'free')).toEqual(['INVALID_TYPE'])
    })
  })

  describe('date and time', () => {
    it('datetime parses ISO timestamps', async () => {
      expect(await codesFor(FieldType.DATETIME, '2026-10-18T09:30:00Z')).toEqual([])
      expect(await codesFor(FieldType.DATETIME, 'yesterday-ish')).toEqual(['INVALID_DATE'])
    })

    it('enforces minDate and maxDate', async () => {
      expect(await codesFor(FieldType.DATE, '2020-01-01', { minDate: '2021-01-01' })).toEqual([
        'MIN_DATE'
      ])
      expect(await codesFor(FieldType.DATE, '2030-01-01', { maxDate: '2029-12-31' })).toEqual([
        'MAX_DATE'
      ])
    })

    it.each([['09:30'], ['23:59:59'], ['0:05']])('time accepts %s', async value => {
      expect(await codesFor(FieldType.TIME, value)).toEqual([])
    })

    it.each([['24:00'], ['12:60'], ['noon']])('time rejects %s', async value => {
      expect(await codesFor(FieldType.TIME, value)).toEqual(['INVALID_TIME'])
    })
  })

  describe('boolean fields', () => {
    it.each([FieldType.CHECKBOX, FieldType.TOGGLE])('%s accepts booleans only', async type => {
      expect(await codesFor(type, true)).toEqual([])
      expect(await codesFor(type, 'true')).toEqual(['INVALID_TYPE'])
    })
  })

  describe('color', () => {
    it.each([['#fff'], ['#A1B2C3'], ['#A1B2C3FF']])('hex accepts %s', async value => {
      expect(await codesFor(FieldType.COLOR, value)).toEqual([])
    })

    it('rejects invalid colors and supports rgb format', async () => {
      expect(await codesFor(FieldType.COLOR, 'red')).toEqual(['INVALID_COLOR'])
      expect(await codesFor(FieldType.COLOR, 'rgb(1, 2, 3)', {}, { format: 'rgb' })).toEqual([])
      expect(await codesFor(FieldType.COLOR, '#fff', {}, { format: 'rgb' })).toEqual([
        'INVALID_COLOR'
      ])
    })
  })

  describe('structured fields', () => {
    it('json enforces maxDepth', async () => {
      expect(await codesFor(FieldType.JSON, { a: { b: 1 } }, { maxDepth: 3 })).toEqual([])
      expect(
        await codesFor(FieldType.JSON, { a: { b: { c: { d: 1 } } } }, { maxDepth: 3 })
      ).toEqual(['MAX_DEPTH_EXCEEDED'])
      expect(await codesFor(FieldType.JSON, 'not an object')).toEqual(['INVALID_TYPE'])
    })

    it('json depth on a deeply nested value fails as a validation error, not a crash', async () => {
      let deep: Record<string, unknown> = {}
      const root = deep
      for (let i = 0; i < 20000; i++) {
        deep.n = {}
        deep = deep.n as Record<string, unknown>
      }
      const codes = await codesFor(FieldType.JSON, root, { maxDepth: 5 })
      expect(codes.length).toBe(1)
      expect(['MAX_DEPTH_EXCEEDED', 'VALIDATION_ERROR']).toContain(codes[0])
    })

    it('repeater checks item count and that items are objects', async () => {
      expect(await codesFor(FieldType.REPEATER, [{ a: 1 }], { min: 1, max: 2 })).toEqual([])
      expect(await codesFor(FieldType.REPEATER, [], { min: 1 })).toEqual(['MIN_ITEMS'])
      expect(await codesFor(FieldType.REPEATER, [{}, {}, {}], { max: 2 })).toEqual(['MAX_ITEMS'])
      expect(await codesFor(FieldType.REPEATER, [1])).toEqual(['INVALID_ITEM'])
    })

    it('group requires a plain object', async () => {
      expect(await codesFor(FieldType.GROUP, { a: 1 })).toEqual([])
      expect(await codesFor(FieldType.GROUP, [1])).toEqual(['INVALID_TYPE'])
    })
  })

  describe('media fields', () => {
    it('file requires a url and enforces declared type and size options', async () => {
      expect(await codesFor(FieldType.FILE, { url: 'https://cdn.example.com/a.pdf' })).toEqual([])
      expect(await codesFor(FieldType.FILE, { name: 'a.pdf' })).toEqual(['MISSING_FILE_URL'])
      expect(
        await codesFor(
          FieldType.FILE,
          { url: 'https://cdn.example.com/a.exe', mimeType: 'application/x-msdownload' },
          {},
          { allowedTypes: ['application/pdf'] }
        )
      ).toEqual(['INVALID_FILE_TYPE'])
      expect(
        await codesFor(
          FieldType.FILE,
          { url: 'https://cdn.example.com/a.pdf', size: 2048 },
          {},
          { maxSize: 1024 }
        )
      ).toEqual(['FILE_TOO_LARGE'])
    })

    it('image enforces dimension options', async () => {
      const image = { url: 'https://cdn.example.com/a.png', width: 100, height: 50 }
      expect(await codesFor(FieldType.IMAGE, image, {}, { minWidth: 200 })).toEqual([
        'IMAGE_TOO_SMALL'
      ])
      expect(await codesFor(FieldType.IMAGE, image, {}, { maxHeight: 40 })).toEqual([
        'IMAGE_TOO_LARGE'
      ])
      expect(await codesFor(FieldType.IMAGE, image, {}, { minWidth: 50, maxHeight: 60 })).toEqual(
        []
      )
    })

    it('gallery validates each image and the item count', async () => {
      const ok = { url: 'https://cdn.example.com/a.png' }
      expect(await codesFor(FieldType.GALLERY, [ok, ok])).toEqual([])
      expect(await codesFor(FieldType.GALLERY, 'not-a-list')).toEqual(['INVALID_TYPE'])
      expect(await codesFor(FieldType.GALLERY, [ok], { min: 2 })).toEqual(['MIN_IMAGES'])
    })

    it('video follows the file rules', async () => {
      expect(await codesFor(FieldType.VIDEO, { url: 'https://cdn.example.com/v.mp4' })).toEqual([])
      expect(await codesFor(FieldType.VIDEO, { title: 'clip' })).toEqual(['MISSING_FILE_URL'])
    })
  })

  describe('relationship fields', () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

    it.each([FieldType.USER, FieldType.TAXONOMY])('%s accepts UUIDs', async type => {
      expect(await codesFor(type, uuid)).toEqual([])
    })

    it.each([FieldType.USER, FieldType.TAXONOMY])('%s rejects non-UUIDs', async type => {
      const codes = await codesFor(type, 'user-1')
      expect(codes.length).toBe(1)
    })
  })
})
