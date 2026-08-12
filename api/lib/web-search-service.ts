import { env } from '../config/env.js'

/**
 * 联网搜索服务（Agent web_search 工具的后端）：
 * - bocha 主引擎：博查 AI Web Search API（境内稳定、结构化摘要），需 WEB_SEARCH_BOCHA_API_KEY
 * - bing 兜底引擎：无 key 直接抓取 Bing 结果页解析（best-effort，借鉴 open-websearch 的无 key 引擎思路）
 * 域名硬编码在服务层，模型只传 query，无 SSRF 面。
 */

export type WebSearchResult = {
  title: string
  url: string
  snippet: string
  /** 来源域名（前端卡片右侧展示） */
  source: string
}

export type WebSearchOutcome = {
  provider: 'bocha' | 'bing'
  results: WebSearchResult[]
}

export class WebSearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebSearchError'
  }
}

const SNIPPET_MAX = 300

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&ensp;|&#0?160;/g, ' ')
    .replace(/&#0?183;|&middot;/g, '·')
    .replace(/&amp;/g, '&')
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** 外部 signal 与超时合并（兼容无 AbortSignal.any 的 Node 版本） */
function withTimeout(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => controller.abort(external?.reason)

  if (external) {
    if (external.aborted) {
      onAbort()
    } else {
      external.addEventListener('abort', onAbort, { once: true })
    }
  }

  const cleanup = () => {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }

  return { signal: controller.signal, cleanup }
}

async function searchBocha(query: string, maxResults: number, signal: AbortSignal): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.webSearchBochaApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, count: maxResults, summary: true }),
    signal,
  })

  if (!response.ok) {
    throw new WebSearchError(`博查返回 ${response.status}`)
  }

  const payload = (await response.json()) as {
    data?: { webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; summary?: string; siteName?: string }> } }
  }
  const values = payload.data?.webPages?.value ?? []

  return values
    .filter((item) => item.url && item.name)
    .map((item) => ({
      title: stripTags(item.name ?? ''),
      url: item.url ?? '',
      snippet: truncate(stripTags(item.summary || item.snippet || ''), SNIPPET_MAX),
      source: item.siteName || hostOf(item.url ?? ''),
    }))
}

/** 无 key 兜底：抓取 Bing 结果页，正则提取 b_algo 块（标题链接 + 摘要段落） */
async function searchBing(query: string, maxResults: number, signal: AbortSignal): Promise<WebSearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'text/html',
    },
    signal,
  })

  if (!response.ok) {
    throw new WebSearchError(`Bing 返回 ${response.status}`)
  }

  const html = await response.text()
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)]
  const results: WebSearchResult[] = []

  for (const block of blocks) {
    if (results.length >= maxResults) {
      break
    }
    // b_algo 块首个链接可能是面包屑站点链接（标题=域名），逐个候选取第一个像真实标题的
    const anchors = [...block[0].matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    let picked: { href: string; title: string } | null = null
    for (const anchor of anchors) {
      const title = stripTags(anchor[2])
      // 面包屑链接特征：文本内嵌 URL（含不带协议头的短域名）、带 › 分隔、或以域名开头
      if (!title || /https?:\/\//.test(title) || title.includes(' › ') || /^([a-z0-9-]+\.)+[a-z]{2,}/i.test(title)) {
        continue
      }
      picked = { href: anchor[1], title }
      break
    }
    if (!picked) {
      continue
    }
    const snippetMatch = block[0].match(/<p[^>]*>([\s\S]*?)<\/p>/)
    results.push({
      title: picked.title,
      url: picked.href,
      snippet: truncate(stripTags(snippetMatch?.[1] ?? ''), SNIPPET_MAX),
      source: hostOf(picked.href),
    })
  }

  if (results.length === 0) {
    throw new WebSearchError('Bing 结果解析为空（可能触发反爬或结构变化）')
  }

  return results
}

/**
 * 联网搜索入口：auto = 有博查 key 用博查、失败降 Bing；显式 bocha/bing 也带降级；disabled 直接不可用。
 * 两引擎都失败抛 WebSearchError，由工具层转成对模型的如实回填。
 */
export async function searchWeb(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<WebSearchOutcome> {
  const { signal: merged, cleanup } = withTimeout(signal, env.webSearchTimeoutMs)

  try {
    const preferBocha =
      env.webSearchProvider === 'bocha' || (env.webSearchProvider === 'auto' && env.webSearchBochaApiKeyConfigured)

    if (env.webSearchProvider === 'disabled') {
      throw new WebSearchError('联网搜索已禁用（WEB_SEARCH_PROVIDER=disabled）')
    }

    if (preferBocha) {
      try {
        const results = await searchBocha(query, maxResults, merged)
        if (results.length > 0) {
          return { provider: 'bocha', results }
        }
      } catch (error) {
        if (signal?.aborted) {
          throw error
        }
        // 博查失败（无 key/非 2xx/解析空）降级 Bing
      }
    }

    const results = await searchBing(query, maxResults, merged)
    return { provider: 'bing', results }
  } finally {
    cleanup()
  }
}
