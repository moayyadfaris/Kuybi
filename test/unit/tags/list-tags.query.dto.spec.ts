import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { ListTagsQueryDto } from '@modules/tags/dto/list-tags.query.dto'

const check = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(ListTagsQueryDto, query)
  return { dto, errors: await validate(dto) }
}

describe('ListTagsQueryDto', () => {
  it('accepts allowlisted sort fields and normalises the direction', async () => {
    const { dto, errors } = await check({ sortBy: 'name', sortOrder: 'desc' })

    expect(errors).toHaveLength(0)
    expect(dto.sortOrder).toBe('DESC')
  })

  it('accepts no parameters', async () => {
    expect((await check({})).errors).toHaveLength(0)
  })

  it.each([
    { sortBy: 'passwordHash' },
    { sortBy: 'name; DROP TABLE tags' },
    { sortOrder: 'sideways' }
  ])('rejects %j', async query => {
    expect((await check(query)).errors.length).toBeGreaterThan(0)
  })
})
