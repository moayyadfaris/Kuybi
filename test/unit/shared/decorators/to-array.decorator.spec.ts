import { ToArray } from '@shared/decorators/to-array.decorator'
import { plainToInstance } from 'class-transformer'
import { IsArray, IsOptional, IsString, validateSync } from 'class-validator'

import 'reflect-metadata'

class Query {
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  action?: string[]
}

// As the global ValidationPipe converts
const parse = (plain: Record<string, unknown>) =>
  plainToInstance(Query, plain, { enableImplicitConversion: true })

describe('ToArray', () => {
  it.each([
    [{ action: 'login' }, ['login']],
    [{ action: ['login', 'logout'] }, ['login', 'logout']],
    [{ action: 'login, logout' }, ['login', 'logout']],
    [{ action: '' }, undefined],
    [{}, undefined]
  ])('%p -> %p', (input, expected) => {
    const query = parse(input)
    expect(query.action).toEqual(expected)
    expect(validateSync(query)).toEqual([])
  })
})
