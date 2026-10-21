import { ConflictException } from '@nestjs/common'
import { slugify, uniqueSlug } from '@shared/utils/slug.util'

describe('slugify', () => {
  it.each([
    ['Product', 'product'],
    ['Blog Post', 'blog-post'],
    ['blog_post', 'blog-post'],
    ['  Many   spaces -- here  ', 'many-spaces-here'],
    ['Café Menu', 'cafe-menu'],
    ['Crème Brûlée', 'creme-brulee'],
    ['C++', 'c'],
    ['مقالات', 'mqalat'],
    ['أخبار 2026', 'akhbar-2026'],
    ['أخبار ٢٠٢٦', 'akhbar-2026'],
    ['الأخبار العاجلة', 'alakhbar-alaajla'],
    ['مَقَالَات', 'mqalat'],
    ['عربي English mix', 'arby-english-mix']
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('returns the fallback when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('item')
    expect(slugify('', { fallback: 'post-type' })).toBe('post-type')
  })

  it('truncates without leaving a trailing hyphen', () => {
    const slug = slugify('abc def ghi', { maxLength: 4 })
    expect(slug).toBe('abc')
  })

  it('only ever produces kebab-case ASCII', () => {
    for (const input of ['مرحبا بالعالم', 'Ünïcödé Tëxt', '日本語 title', '🚀 Launch!']) {
      expect(slugify(input)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})

describe('uniqueSlug', () => {
  const existsIn = (taken: string[]) => async (slug: string) => taken.includes(slug)

  it('returns the base slug when it is free', async () => {
    await expect(uniqueSlug('news', existsIn([]))).resolves.toBe('news')
  })

  it('appends the first free numeric suffix', async () => {
    await expect(uniqueSlug('news', existsIn(['news', 'news-2']))).resolves.toBe('news-3')
  })

  it('keeps the result within maxLength', async () => {
    const result = await uniqueSlug('abcdef', existsIn(['abcdef']), 6)
    expect(result).toBe('abcd-2')
  })

  it('switches to a random suffix once the numbered slugs are taken', async () => {
    const taken = ['news', ...Array.from({ length: 9 }, (_, i) => `news-${i + 2}`)]

    const result = await uniqueSlug('news', existsIn(taken), 12)

    expect(result).toMatch(/^news-[a-z0-9]{6}$/)
    expect(result.length).toBeLessThanOrEqual(12)
  })

  it('gives up with 409 after a bounded number of lookups', async () => {
    const exists = jest.fn().mockResolvedValue(true)

    await expect(uniqueSlug('news', exists)).rejects.toBeInstanceOf(ConflictException)
    expect(exists.mock.calls.length).toBeLessThanOrEqual(13)
  })
})
