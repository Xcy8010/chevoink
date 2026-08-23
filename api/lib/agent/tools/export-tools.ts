import { z } from 'zod'

import { createStoredExport } from '../../export-store.js'
import { buildNovelExportZip } from '../../export-service.js'
import { defineTool } from './types.js'

/** 一键导出：只读打包 zip，产物入内存仓库供下载卡片拉取（TTL 15 分钟） */
export const novelExportTool = defineTool({
  name: 'novel_export',
  title: '一键导出',
  description:
    '把当前作品一键导出为 zip 下载包：作品名 > 规划 / 目录 / 章节 / 作品信息以及发布建议 四个文件夹，章节逐章存为 txt，发布建议由 AI 按番茄小说官方词表生成。作者说"一键导出"时调用；支持按需裁剪：chapterIds 只导出指定章节，includePlans/includeCatalog/includeInfo/includeChapters 置 false 可排除对应部分（如作者说"不要导出规划"就把 includePlans 设为 false）。',
  parameters: z.object({
    includePlans: z.boolean().optional().describe('是否包含「规划」文件夹，默认 true；作者明确不要规划时置 false'),
    includeCatalog: z.boolean().optional().describe('是否包含「目录」，默认 true'),
    includeInfo: z.boolean().optional().describe('是否包含「作品信息以及发布建议」，默认 true'),
    includeChapters: z.boolean().optional().describe('是否包含「章节」，默认 true'),
    chapterIds: z
      .array(z.string().min(1))
      .optional()
      .describe('只导出这些章节 ID（可从 novel_get_context 的章节列表获取）；缺省导出全部章节'),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' } as const,
  readOnly: true,
  async execute(ctx, args) {
    const result = await buildNovelExportZip(ctx.userId, ctx.novelId, {
      includePlans: args.includePlans,
      includeCatalog: args.includeCatalog,
      includeInfo: args.includeInfo,
      includeChapters: args.includeChapters,
      chapterIds: args.chapterIds,
    })

    const exportId = createStoredExport(ctx.userId, result.buffer, result.fileName)

    return {
      output: `导出完成：${result.fileName}（含${result.summary}）。下载链接 15 分钟内有效，已生成下载卡片，作者点击即可保存到本地。请提醒作者尽快下载。`,
      summary: `一键导出 · ${result.summary}`,
      display: {
        kind: 'exportReady',
        downloadUrl: `/api/agent/exports/${exportId}`,
        fileName: result.fileName,
        detail: result.summary,
      },
    }
  },
})
