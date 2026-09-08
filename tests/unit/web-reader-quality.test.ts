import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { assessReaderText, extractReaderHtml, extractReaderLinks } from '../../api/lib/web-reader-quality.js'
import { decodeWebPageBuffer } from '../../api/lib/html-extract.js'

const body = '山谷里的村民清晨出发，沿着河岸查看新修的水渠。他们记录水位与天气，并讨论下一阶段的耕种计划。'

describe('reader content quality without navigation false positives', () => {
  it('returns actual bounded same-site chapter links without inventing URLs', () => {
    const html = '<a href="/about">关于</a><a href="http://127.0.0.1/private">私网</a><a href="javascript:alert(1)">脚本</a><a href="https://other.example/reader/1">其他站点</a>'
      + Array.from({ length: 12 }, (_, i) => `<a href="/reader/${100 + i}?page=2&amp;source=index">第${i + 1}章</a>`).join('')
    const links = extractReaderLinks(html, 'https://fanqienovel.com/page/123')
    expect(links).toHaveLength(13)
    expect(links[0]).toEqual({ title: '第1章', url: 'https://fanqienovel.com/reader/100?page=2&source=index' })
    expect(links.slice(0, 12).every(item => item.url.startsWith('https://fanqienovel.com/reader/'))).toBe(true)
    expect(links[11].title).toBe('第12章')
  })
  it('excludes private-use icon navigation and hidden content from body quality', () => {
    const result = extractReaderHtml(`<html><head><title>水渠观察</title></head><body><nav>${'\ue123'.repeat(1000)}</nav><div hidden>${'\ufffd'.repeat(500)}</div><article><h1>水渠观察</h1><p>${body.repeat(6)}</p></article></body></html>`)
    expect(result.status).toBe('ok')
    expect(result.quality.privateUseRatio).toBe(0)
    expect(result.quality.replacementRatio).toBe(0)
  })
  it('does not reject an article merely mentioning login and HTTP 404', () => {
    const result = extractReaderHtml(`<html><title>网页错误处理指南</title><body><a href="/login">登录</a><article><h1>网页错误处理指南</h1><p>本节解释登录、HTTP 404和验证码的设计。</p><p>${body.repeat(6)}</p></article></body></html>`)
    expect(result.status).toBe('ok')
  })
  it.each(['\ue123', '\u{f0123}', '\u{100123}', '\ufffd'])('refuses significant unreadable glyph content %s', glyph => {
    const result = assessReaderText(`${body}${glyph.repeat(400)}`)
    expect(result.code).toBe('WEB_READ_GARBLED')
    expect(result.text).toBe('')
    expect(result.quality.readable).toBe(false)
  })
  it('keeps paragraph boundaries instead of collapsing the whole page onto one line', () => {
    const result = extractReaderHtml(`<article><h1>水渠观察</h1><p>${body.repeat(3)}</p><p>${body.repeat(3)}</p></article>`, false)
    expect(result.status).toBe('ok')
    expect(result.text).toContain('\n\n')
  })
  it('refuses documents exceeding the DOM element budget', () => {
    const result = extractReaderHtml(`<article>${'<span>字</span>'.repeat(20001)}</article>`)
    expect(result.code).toBe('WEB_READ_COMPLEX_DOCUMENT')
  })
  it.each(['GBK', 'GB2312', 'GB18030'])('decodes an explicitly declared %s page', charset => {
    const bytes = iconv.encode(body, charset)
    expect(decodeWebPageBuffer(bytes, `text/html; charset = "${charset}"`)).toBe(body)
  })
  it('uses meta charset when HTTP charset is missing', () => {
    const html = `<meta charset="gbk"><article>${body}</article>`
    expect(decodeWebPageBuffer(iconv.encode(html, 'gbk'), 'text/html')).toBe(html)
  })
})
