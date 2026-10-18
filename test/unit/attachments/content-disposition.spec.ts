import { contentDisposition } from '@modules/attachments/controllers/attachments.controller'

describe('contentDisposition', () => {
  it('keeps plain names readable', () => {
    expect(contentDisposition('report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`
    )
  })

  it.each([
    ['quote', 'a"; filename="evil.exe'],
    ['CRLF', 'a.pdf\r\nSet-Cookie: x=1'],
    ['backslash', 'a\\b.pdf']
  ])('neutralises %s in the header', (_, name) => {
    const header = contentDisposition(name)

    expect(header).not.toMatch(/[\r\n]/)
    // Exactly the two quotes that delimit the fallback filename
    expect(header.match(/"/g)).toHaveLength(2)
  })

  it('keeps non-ASCII names in the RFC 5987 parameter', () => {
    const header = contentDisposition('تقرير.pdf')

    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('تقرير.pdf')}`)
    expect(header).toContain('filename="_____.pdf"')
  })
})
