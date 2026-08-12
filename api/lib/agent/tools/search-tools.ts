import dns from 'node:dns'

import { z } from 'zod'

import { searchWeb } from '../../web-search-service.js'
import type { WebSearchOutcome } from '../../web-search-service.js'
import { consumeWebReadBudget, consumeWebSearchBudget, getCachedWebSearch, setCachedWebSearch } from '../permissions.js'
import { defineTool } from './types.js'

/**
 * 联网搜索工具：作者主动要求查资料，或记忆/章节知识覆盖不到的外部事实
 * （真实事件、专业术语、行业数据、时事）时触发；作品内部设定类问题走 memory_search。
 * 后端多引擎：博查 API 主、搜狗/Bing 无 key 抓取兜底（api/lib/web-search-service.ts）。
 * web_read 网页深读：搜索摘要不够时读取结果页原文，带 SSRF 防护（私网段黑名单 + 逐跳校验）。
 */

const SNIPPET_IN_OUTPUT = 200

/** 归一化搜索词：压缩空白 + 转小写，用于同 run 内去重缓存 */
function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase()
}

const webSearchParameters = z.object({
  query: z
    .string()
    .min(1)
    .max(120)
    .describe('搜索关键词（提炼核心词而非整句话，如「唐朝 节度使 职权」而不是「我想了解一下唐朝的节度使是干什么的」）'),
  maxResults: z
    .number()
    .int()
    .min(2)
    .max(8)
    .default(6)
    .describe('期望返回的结果条数，默认 6'),
})

export const webSearchTool = defineTool({
  name: 'web_search',
  title: '联网搜索',
  description:
    '当作者明确要求联网搜索/查资料，或任务涉及记忆与章节知识无法覆盖的外部事实（真实人物事件、专业术语、行业数据、时事）时，用本工具获取实时信息；作品内部设定、角色、伏笔等问题用 memory_search，不要用本工具。返回的是摘要；若摘要不足以回答问题，用 web_read 深读最相关的 1-2 个链接原文后再作答。引用搜索结果时在回复中注明来源。一次任务最多搜索 5 次。',
  parameters: webSearchParameters,
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: true,
  async execute(ctx, args) {
    // 同 run 内归一化 query 去重：命中缓存直接返回，不扣搜索预算
    const normalizedQuery = normalizeSearchQuery(args.query)
    const cached = getCachedWebSearch(ctx.runId, normalizedQuery) as WebSearchOutcome | undefined

    // 搜索预算：超出额度直接回填，防止循环滥用
    if (!cached && !consumeWebSearchBudget(ctx.runId)) {
      return {
        output:
          '本次任务的联网搜索次数已用完（每次任务最多 5 次）。请基于已获取的搜索结果与既有知识完成任务，不要再搜索。',
        summary: '搜索预算已用尽',
      }
    }

    try {
      const outcome = cached ?? (await searchWeb(args.query, args.maxResults, ctx.signal))

      if (!cached && outcome.results.length > 0) {
        setCachedWebSearch(ctx.runId, normalizedQuery, outcome)
      }

      if (outcome.results.length === 0) {
        return {
          output: `联网搜索「${args.query}」没有返回结果。请基于既有知识完成，并如实告知作者未检索到相关资料。`,
          summary: `已检索网络「${args.query}」· 0 个结果`,
          display: { kind: 'webSearch', query: args.query, provider: outcome.provider, results: [] },
        }
      }

      const listing = outcome.results
        .map(
          (result, index) =>
            `[${index + 1}] ${result.title}（${result.source}）：${result.snippet.slice(0, SNIPPET_IN_OUTPUT)}`,
        )
        .join('\n')

      return {
        output: `联网搜索「${args.query}」共 ${outcome.results.length} 条结果（来源引擎：${outcome.provider}）：\n${listing}\n引用时注明来源；若结果与任务无关，基于既有知识继续，不要重复搜索同一问题。若以上摘要不足以回答问题，可用 web_read 深读其中最相关的 1-2 个链接原文。`,
        summary: `已检索网络「${args.query}」· ${outcome.results.length} 个结果`,
        display: { kind: 'webSearch', query: args.query, provider: outcome.provider, results: outcome.results },
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误'
      return {
        output: `联网搜索暂时不可用（${reason}）。请基于既有知识完成任务，并在最终说明中如实告知作者本次未能联网检索。`,
        summary: `联网搜索不可用：${reason}`,
        display: { kind: 'webSearch', query: args.query, provider: 'unavailable', results: [] },
      }
    }
  },
})

// ---------------------------------------------------------------------------
// web_read 网页深读：搜索摘要不够时读取结果页原文（SSRF 防护：私网段黑名单 + 逐跳校验）
// ---------------------------------------------------------------------------

const WEB_READ_MAX_REDIRECTS = 5
const WEB_READ_TIMEOUT_MS = 12000
const WEB_READ_TEXT_MAX = 6000
const WEB_READ_TEXT_MIN = 150

/** 外部 signal 与超时合并 */
function withReadTimeout(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
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

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80')) {
    return true
  }
  const parts = ip.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false
  }
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

/** 逐跳校验：仅 http/https，DNS 解析后拒绝任一指向私网段的地址（防 SSRF/DNS rebinding） */
async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`不支持的协议 ${url.protocol}`)
  }
  let addresses: Array<{ address: string }>
  try {
    addresses = await dns.promises.lookup(url.hostname, { all: true })
  } catch {
    throw new Error(`域名无法解析：${url.hostname}`)
  }
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error(`拒绝访问内网地址：${url.hostname}`)
  }
}

/** 手动跟随重定向：每一跳重新做安全校验，防止跳转链绕进内网 */
async function fetchFollowingRedirects(
  startUrl: URL,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = startUrl

  for (let hop = 0; hop <= WEB_READ_MAX_REDIRECTS; hop += 1) {
    await assertSafeUrl(currentUrl)
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })

    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error(`重定向缺少 location（HTTP ${response.status}）`)
      }
      currentUrl = new URL(location, currentUrl)
      continue
    }

    if (!response.ok) {
      throw new Error(`页面返回 HTTP ${response.status}`)
    }

    return { response, finalUrl: currentUrl }
  }

  throw new Error(`重定向超过 ${WEB_READ_MAX_REDIRECTS} 跳`)
}

/** HTML → 纯文本：先去脚本/样式/导航等非正文块，再剥标签、解实体、压空白 */
function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const text = withoutNoise
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&ensp;|&#0?160;/g, ' ')
    .replace(/&#0?183;|&middot;/g, '·')
    .replace(/&amp;/g, '&')
  return text.replace(/\s+/g, ' ').trim()
}

const webReadParameters = z.object({
  url: z
    .string()
    .url()
    .describe('要深读的网页 URL（优先从 web_search 结果里选与问题最相关的链接）'),
})

export const webReadTool = defineTool({
  name: 'web_read',
  title: '网页深读',
  description:
    '读取指定网页的正文文本（最多约 6000 字）。适用于 web_search 返回的摘要不足以回答问题时，深读最相关的搜索结果原文；也可读作者直接给出的参考链接。仅支持 http/https 公开页面；遇到登录墙/JS 渲染页会提示换来源。一次任务最多读取 8 个页面。',
  parameters: webReadParameters,
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: true,
  async execute(ctx, args) {
    if (!consumeWebReadBudget(ctx.runId)) {
      return {
        output: '本次任务的网页读取次数已用完（每次任务最多 8 次）。请基于已获取的内容与既有知识完成任务。',
        summary: '网页读取预算已用尽',
      }
    }

    let host = ''
    try {
      const startUrl = new URL(args.url)
      host = startUrl.host
      const { signal, cleanup } = withReadTimeout(ctx.signal, WEB_READ_TIMEOUT_MS)

      try {
        const { response, finalUrl } = await fetchFollowingRedirects(startUrl, signal)
        host = finalUrl.host
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType && !/text\/|application\/(?:json|xml|xhtml)/.test(contentType)) {
          throw new Error(`不支持的内容类型 ${contentType}（非网页文本）`)
        }

        const raw = await response.text()
        const text = contentType.includes('json') ? raw.replace(/\s+/g, ' ').trim() : htmlToText(raw)

        if (text.length < WEB_READ_TEXT_MIN) {
          return {
            output: `网页「${host}」可提取正文不足（${text.length} 字），可能需登录或为 JS 渲染页。请换一个搜索结果来源深读，或基于既有知识作答。`,
            summary: `已读取网页「${host}」· 正文不足`,
            display: { kind: 'markdown', markdown: `已读取网页（${host}）：正文内容不足，可能需登录或为 JS 渲染页。` },
          }
        }

        const truncated = text.length > WEB_READ_TEXT_MAX ? `${text.slice(0, WEB_READ_TEXT_MAX)}…` : text
        return {
          output: `网页「${finalUrl.href}」正文（已截断至 ${WEB_READ_TEXT_MAX} 字以内）：\n${truncated}\n引用时注明来源；内容不足以作答时换其他来源，不要编造。`,
          summary: `已读取网页「${host}」`,
          display: { kind: 'markdown', markdown: `已读取网页（${host}）：\n${truncated.slice(0, 1200)}${text.length > 1200 ? '…' : ''}` },
        }
      } finally {
        cleanup()
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误'
      return {
        output: `网页读取失败（${reason}）。请换其他搜索结果来源深读，或基于既有知识如实作答，不要编造。`,
        summary: `网页读取失败：${reason}`,
      }
    }
  },
})
