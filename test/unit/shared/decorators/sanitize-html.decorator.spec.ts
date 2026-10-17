import { SanitizeHtml } from '@shared/decorators/sanitization.decorator'
import { validateSync } from 'class-validator'

class RichText {
  @SanitizeHtml()
  body!: string
}

class PlainText {
  @SanitizeHtml({ stripTags: true })
  body!: string
}

const sanitize = <T extends { body: string }>(Cls: new () => T, body: string) => {
  const dto = Object.assign(new Cls(), { body })
  validateSync(dto)
  return dto.body
}

describe('@SanitizeHtml', () => {
  it('keeps allowed tags and their allowed attributes', () => {
    expect(sanitize(RichText, '<a href="https://ok.example" title="t">x</a>')).toBe(
      '<a href="https://ok.example" title="t">x</a>'
    )
  })

  it('removes attributes outside the allowlist, including style and class', () => {
    expect(sanitize(RichText, '<p style="position:fixed;inset:0" class="c">p</p>')).toBe('<p>p</p>')
  })

  it('removes event handlers and script', () => {
    const out = sanitize(
      RichText,
      '<img src="https://i.example/a.png" onerror="alert(1)"><script>x</script>'
    )
    expect(out).not.toMatch(/onerror|<script/i)
  })

  it('stripTags removes unclosed tags as well', () => {
    const out = sanitize(PlainText, 'hi <img src=x onerror=alert(1)')
    expect(out).not.toMatch(/<img|onerror/i)
    expect(out).toContain('hi')
  })
})
