import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common'
import { ErrorCode, jsonPointer, toErrorCode, validationExceptionFactory } from '@shared/errors'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsEmail, IsIn, IsString, MinLength, ValidateNested } from 'class-validator'

class Address {
  @IsString()
  @MinLength(2)
  city!: string
}

class Item {
  @IsIn(['a', 'b'])
  kind!: string
}

class SignUp {
  @IsEmail()
  email!: string

  @MinLength(6)
  password!: string

  @ValidateNested()
  @Type(() => Address)
  address!: Address

  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => Item)
  items!: Item[]
}

describe('validationExceptionFactory', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory
  })
  const meta: ArgumentMetadata = { type: 'body', metatype: SignUp }

  const validate = async (body: object) => {
    try {
      await pipe.transform(body, meta)
    } catch (error) {
      return (error as BadRequestException).getResponse() as {
        code: string
        message: string
        errors: Array<Record<string, unknown>>
      }
    }
    throw new Error('expected a validation failure')
  }

  it('reports one field error per failed constraint, with pointer, code and params', async () => {
    const body = await validate({
      email: 'nope',
      password: 'abc',
      address: { city: 'X' },
      items: [{ kind: 'a' }, { kind: 'z' }]
    })

    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED)
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointer: '/email', field: 'email', code: 'IS_EMAIL' }),
        expect.objectContaining({
          pointer: '/password',
          code: 'MIN_LENGTH',
          params: { min: 6 }
        }),
        expect.objectContaining({
          pointer: '/address/city',
          field: 'address.city',
          code: 'MIN_LENGTH',
          params: { min: 2 }
        }),
        expect.objectContaining({
          pointer: '/items/1/kind',
          field: 'items.1.kind',
          code: 'IS_IN',
          params: { values: ['a', 'b'] }
        })
      ])
    )
    expect(body.errors).toHaveLength(4)
    expect(body.message).toMatch(/4 problems/)
  })

  it('names an unknown field as such', async () => {
    const body = await validate({
      email: 'a@b.co',
      password: 'secret-1',
      address: { city: 'Amman' },
      items: [],
      admin: true
    })

    expect(body.errors).toEqual([
      expect.objectContaining({ pointer: '/admin', code: 'UNKNOWN_FIELD' })
    ])
    expect(body.message).toBe(body.errors[0].message)
  })
})

describe('field error helpers', () => {
  it('escapes JSON Pointer segments (RFC 6901)', () => {
    expect(jsonPointer(['a/b', 'c~d', 0])).toBe('/a~1b/c~0d/0')
  })

  it('turns constraint names into codes', () => {
    expect(toErrorCode('minLength')).toBe('MIN_LENGTH')
    expect(toErrorCode('isEmail')).toBe('IS_EMAIL')
    expect(toErrorCode('IS_IN')).toBe('IS_IN')
  })
})
