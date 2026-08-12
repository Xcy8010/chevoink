import { z } from 'zod'

import { searchWeb } from '../../web-search-service.js'
import { consumeWebSearchBudget } from '../permissions.js'
import { defineTool } from './types.js'

/**
 * 联网搜索工具：作者主动要求查资料，或记忆/章节知识覆盖不到的外部事实
 * （真实事件、专业术语、行业数据、时事）时触发；作品内部设定类问题走 memory_search。
 * 后端双引擎：博查 API 主、Bing 无 key 抓取兜底（api/lib/web-search-service.ts）。
 */

const SNIPPET_IN_OUTPUT = 200

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
    '当作者明确要求联网搜索/查资料，或任务涉及记忆与章节知识无法覆盖的外部事实（真实人物事件、专业术语、行业数据、时事）时，用本工具获取实时信息；作品内部设定、角色、伏笔等问题用 memory_search，不要用本工具。引用搜索结果时在回复中注明来源。一次任务最多搜索 5 次。',
  parameters: webSearchParameters,
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: true,
  async execute(ctx, args) {
    // 搜索预算：超出额度直接回填，防止循环滥用
    if (!consumeWebSearchBudget(ctx.runId)) {
      return {
        output:
          '本次任务的联网搜索次数已用完（每次任务最多 5 次）。请基于已获取的搜索结果与既有知识完成任务，不要再搜索。',
        summary: '搜索预算已用尽',
      }
    }

    try {
      const outcome = await searchWeb(args.query, args.maxResults, ctx.signal)

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
        output: `联网搜索「${args.query}」共 ${outcome.results.length} 条结果（来源引擎：${outcome.provider}）：\n${listing}\n引用时注明来源；若结果与任务无关，基于既有知识继续，不要重复搜索同一问题。`,
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
