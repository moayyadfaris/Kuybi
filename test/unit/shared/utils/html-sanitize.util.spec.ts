/**
 * The one rich-text HTML policy (content WYSIWYG fields): allowed tags and attributes
 * only, no event handlers in any quoting, no script, style or javascript:/data: URLs.
 */
import { sanitizeRichText, stripHtml } from '@shared/utils/html-sanitize.util'

describe('sanitizeRichText', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', /onerror/i],
    ['<img src="x" onerror="alert(1)">', /onerror/i],
    ["<a href='javascript:alert(1)'>x</a>", /javascript:/i],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', /javascript:/i],
    ['<img src="data:text/html;base64,PHNjcmlwdD4=">', /data:/i],
    ['<script>alert(1)</script>', /<script/i],
    ['<p style="position:fixed" class="overlay">x</p>', /style=|class=/i],
    ['<svg><g onload=alert(1)></g></svg>', /onload|<svg/i],
    ['<iframe src="https://evil.test"></iframe>', /<iframe/i]
  ])('removes the unsafe part of %s', (html, unsafe) => {
    expect(sanitizeRichText(html)).not.toMatch(unsafe)
  })

  it('keeps ordinary rich text', () => {
    const html =
      '<h2>Title</h2><p><strong>Bold</strong> and <a href="https://kuybi.dev/x" title="t">a link</a></p><ul><li>one</li></ul>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it('keeps relative and mailto links', () => {
    expect(sanitizeRichText('<a href="/stories/1">s</a>')).toContain('href="/stories/1"')
    expect(sanitizeRichText('<a href="mailto:a@b.test">m</a>')).toContain('mailto:')
  })
})

describe('stripHtml', () => {
  it('removes every tag, unclosed ones included, and keeps the text', () => {
    expect(stripHtml('<p>Hello <b>you</b></p><img src=x onerror=alert(1)')).toBe('Hello you')
  })
})
