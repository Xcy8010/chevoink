// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const html = readFileSync('desktop/windows/shell-ui/index.html', 'utf8')
const script = readFileSync('desktop/windows/shell-ui/main.js', 'utf8')
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
function page(hash = '') {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const window = Object.assign(new EventTarget(), { location: { hash } })
  runInNewContext(script, { document, window, setTimeout, clearTimeout })
  return { document, window }
}
it('shows loading rather than a false failure and offers bounded slow-connection feedback', () => {
  const { document } = page()
  expect(document.querySelector('h1')?.textContent).toBe('正在连接 Chevoink')
  vi.advanceTimersByTime(15000)
  expect(document.getElementById('detail')?.textContent).toContain('连接时间较长')
  expect(vi.getTimerCount()).toBe(0)
})
it.each([['tls', '安全证书'], ['dns', 'DNS'], ['timeout', '超时'], ['crash', '停止自动重载'], ['engine', 'WebView2']])('renders %s without remote content or retry loops', (code, text) => {
  const { document } = page(`#${code}`)
  expect(document.getElementById('detail')?.textContent).toContain(text)
  expect(document.getElementById('progress')?.hidden).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  expect(document.querySelector('a')?.getAttribute('href')).toBe('https://chevoink.chevolink.com')
})
it('does not render arbitrary hash markup or inherited object properties', () => {
  const { document, window } = page('#toString')
  expect(document.querySelector('h1')?.textContent).toBe('正在连接 Chevoink')
  window.location.hash = '#<img src=x onerror=alert(1)>'
  window.dispatchEvent(new Event('hashchange'))
  expect(document.querySelector('img')).toBeNull()
  expect(document.body.textContent).not.toContain('onerror')
})
