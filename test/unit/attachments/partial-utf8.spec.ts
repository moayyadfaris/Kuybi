import { isUtf8 } from 'buffer'

import { withoutPartialUtf8Tail } from '@modules/attachments/services/file-validation.service'

describe('withoutPartialUtf8Tail', () => {
  const text = Buffer.from('مرحبا hello 😀', 'utf8')

  it('makes every prefix of valid UTF-8 text valid again', () => {
    for (let cut = 0; cut <= text.length; cut++) {
      expect(isUtf8(withoutPartialUtf8Tail(text.subarray(0, cut)))).toBe(true)
    }
  })

  it('drops at most an incomplete final character', () => {
    expect(withoutPartialUtf8Tail(text)).toEqual(text)
    expect(text.length - withoutPartialUtf8Tail(text.subarray(0, text.length - 1)).length).toBe(4)
  })

  it('still lets genuinely invalid bytes be detected', () => {
    expect(isUtf8(withoutPartialUtf8Tail(Buffer.from([0x61, 0xff, 0x62])))).toBe(false)
  })
})
