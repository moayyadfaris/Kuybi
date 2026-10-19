import { ToBoolean } from '@shared/decorators/to-boolean.decorator'
import { plainToInstance } from 'class-transformer'
import { IsBoolean, IsOptional, validateSync } from 'class-validator'

import 'reflect-metadata'

class Query {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  flag?: boolean

  @ToBoolean()
  @IsBoolean()
  isPublic: boolean = true
}

// The global ValidationPipe converts with enableImplicitConversion, which is what turned
// "false" into true before
const parse = (plain: Record<string, unknown>) =>
  plainToInstance(Query, plain, { enableImplicitConversion: true })

describe('ToBoolean', () => {
  it.each([
    ['false', false],
    ['0', false],
    ['no', false],
    ['true', true],
    ['1', true],
    [false, false],
    [true, true]
  ])('parses %p as %p (query strings, multipart fields, JSON)', (input, expected) => {
    expect(parse({ flag: input }).flag).toBe(expected)
  })

  it('keeps the default when the field is absent', () => {
    expect(parse({}).isPublic).toBe(true)
    expect(parse({ isPublic: 'false' }).isPublic).toBe(false)
  })

  it('rejects values that are not boolean-like', () => {
    const errors = validateSync(parse({ isPublic: 'maybe' }))

    expect(errors.map(e => e.property)).toEqual(['isPublic'])
  })
})
