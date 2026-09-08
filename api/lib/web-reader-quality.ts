import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { parsePublicHttpUrl } from './public-http.js'

/** Follow only actual same-site anchors. Never synthesize reader/chapter IDs. */
export function extractReaderLinks(html: string, finalUrl: string): Array<{ url: string; title: string }> {
  const base = parsePublicHttpUrl(finalUrl, true)
  const { document } = parseHTML(html)
  const links = new Map<string, { url: string; title: string }>()
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (links.size >= 4096) break
    try {
      const url = parsePublicHttpUrl(new URL(anchor.getAttribute('href')!, base).href, true)
      const title = anchor.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? ''
      if (url.origin !== base.origin || url.href === base.href || !title || url.pathname === '/') continue
      links.set(url.href, { url: url.href, title })
    } catch { /* Unsupported/unsafe anchors are not discovery results. */ }
  }
  return [...links.values()].sort((a, b) => Number(/第.{1,12}章|chapter\s*\d/i.test(b.title)) - Number(/第.{1,12}章|chapter\s*\d/i.test(a.title)))
}

export type ReaderQuality = { readable: boolean; privateUseRatio: number; replacementRatio: number; textChars: number }
export type ReaderQualityResult = {
  status: 'ok' | 'blocked' | 'not_found' | 'unreadable'
  code: string
  text: string
  title: string
  quality: ReaderQuality
}

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[\t \u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const blockedHeading = /^(?:(?:请|需要|必须)?(?:先)?登录(?:后|以|才|才能)|登录后阅读|访问受限|拒绝访问|安全验证|人机验证|验证码验证|付费阅读|订阅后阅读|access denied|forbidden|sign in to (?:read|continue)|log in to (?:read|continue)|just a moment|verify (?:you|that you))/i
const missingHeading = /^(?:404(?:\s*[-:：|]\s*|\s+)(?:not found|页面不存在)|404$|页面(?:不存在|未找到|已删除)|章节(?:不存在|已删除)|not found|page not found|410\s+gone)/i

/** Quality is measured on extracted content, not icon-heavy navigation or scripts. */
export function assessReaderText(text: string, title = ''): ReaderQualityResult {
  const normalized = normalize(text)
  let length = 0, privateUse = 0, replacement = 0
  for (const char of normalized) {
    if (/\s/u.test(char)) continue
    length++
    const point = char.codePointAt(0)!
    if ((point >= 0xe000 && point <= 0xf8ff) || (point >= 0xf0000 && point <= 0xffffd) || (point >= 0x100000 && point <= 0x10fffd)) privateUse++
    if (point === 0xfffd) replacement++
  }
  const quality: ReaderQuality = { readable: false, privateUseRatio: privateUse / Math.max(1, length), replacementRatio: replacement / Math.max(1, length), textChars: normalized.length }
  const result = (status: ReaderQualityResult['status'], code: string): ReaderQualityResult => ({ status, code, text: status === 'ok' ? normalized : '', title, quality: { ...quality, readable: status === 'ok' } })
  const headings = [title.trim(), normalized.split('\n')[0].trim()]
  if (headings.some(value => missingHeading.test(value))) return result('not_found', 'WEB_READ_NOT_FOUND')
  if (headings.some(value => blockedHeading.test(value))) return result('blocked', 'WEB_READ_BLOCKED')
  if ((privateUse >= 3 && quality.privateUseRatio > 0.01) || (replacement >= 3 && quality.replacementRatio > 0.005)) return result('unreadable', 'WEB_READ_GARBLED')
  if (length < 150) return result('unreadable', 'WEB_READ_INSUFFICIENT')
  return result('ok', 'WEB_READ_OK')
}

export function extractReaderHtml(html: string, useReadability = true): ReaderQualityResult {
  const { document } = parseHTML(html)
  const title = (document.querySelector('title')?.textContent ?? document.querySelector('h1')?.textContent ?? '').trim().slice(0, 300)
  if (document.querySelectorAll('*').length > 20000) return { ...assessReaderText('', title), status: 'unreadable', code: 'WEB_READ_COMPLEX_DOCUMENT' }
  // Do not strip explicit access/error gates before checking them.
  const heading = document.querySelector('h1')?.textContent ?? ''
  const gate = assessReaderText(heading, title)
  if (gate.status === 'blocked' || gate.status === 'not_found') return gate
  for (const node of document.querySelectorAll('script,style,noscript,svg,nav,footer,aside,form,button,[hidden],[aria-hidden="true"]')) node.remove()
  for (const node of document.querySelectorAll('br')) node.replaceWith(document.createTextNode('\n'))
  for (const node of document.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')) node.appendChild(document.createTextNode('\n\n'))
  const candidate = document.querySelector('article,[role="main"],main') ?? document.body
  let text = candidate?.textContent ?? ''
  if (!text.trim()) text = document.documentElement?.textContent ?? ''
  if (useReadability) {
    try {
      const article = new Readability(document, { maxElemsToParse: 20000 }).parse()
      // Never replace an unreadable body with title/navigation to pass the threshold.
      if (article?.textContent && article.textContent.trim().length >= 150) text = article.textContent
    } catch { /* The cleaned DOM candidate is still subject to the same quality gate. */ }
  }
  return assessReaderText(text, title)
}
