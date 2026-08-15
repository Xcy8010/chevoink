import { z } from 'zod'

import { FIXED_NOVEL_COVER_SIZE } from '../../../../shared/contracts/index.js'
import { generateCoverImageData } from '../../ai-service.js'
import { prisma } from '../../prisma.js'
import { defineTool } from './types.js'

const WRITE_PERMISSION = { plan: 'deny', build: 'allow', review: 'deny' } as const

/** 生成封面候选图（复用现有生图与 CoverAsset 存储实现） */
export const coverGenerateTool = defineTool({
  name: 'cover_generate',
  title: '生成封面',
  description:
    '按提示词生成封面候选图（3:4 竖版书封），生成结果会展示给用户挑选。建议先用 cover_prompt_set 保存提示词再生成。生图服务响应很慢（单张可能需要几分钟），一次最多生成 2 张，需要更多候选时分多次调用。',
  parameters: z.object({
    prompt: z.string().min(4).max(2000).describe('封面提示词（中文，含主体/氛围/构图/风格关键词）'),
    count: z.number().int().min(1).max(2).optional().describe('生成张数，默认 1，最多 2'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { title: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    const { images } = await generateCoverImageData(ctx.userId, {
      prompt: args.prompt.trim(),
      size: FIXED_NOVEL_COVER_SIZE,
      count: args.count ?? 1,
      novelId: ctx.novelId,
    })

    if (images.length === 0) {
      return { output: '封面生成失败：图像服务没有返回结果，可稍后重试或调整提示词。' }
    }

    const candidates = images
      .map((image, index) => `候选${index + 1}：coverAssetId ${image.id}，候选图 url ${image.imageUrl}`)
      .join('；')

    return {
      output: `已生成 ${images.length} 张封面候选图：${candidates}。接下来必须先对每张候选调用 view_image（url 传上面给出的候选图 url，也可直传 coverAssetId）校验画面（主体/文字/构图是否符合提示词「${args.prompt.slice(0, 120)}」），校验通过后再用 ask_user 询问作者是否应用（多张时问选哪张），得到确认后用 cover_apply 带对应 ID 应用；不要不问就结束任务。`,
      summary: `生成 ${images.length} 张封面候选`,
      display: {
        kind: 'coverImages',
        images: images.map((image) => ({ id: image.id, url: image.imageUrl })),
      },
    }
  },
})

/** 把已生成的封面应用为作品封面 */
export const coverApplyTool = defineTool({
  name: 'cover_apply',
  title: '应用封面',
  description: '把 cover_generate 生成的某张候选图设为当前作品的正式封面。coverAssetId 来自 cover_generate 的返回结果。',
  parameters: z.object({
    coverAssetId: z.string().describe('要应用的封面资源 ID'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const asset = await prisma.coverAsset.findFirst({
      where: { id: args.coverAssetId, ownerUserId: ctx.userId },
      select: { id: true, imageUrl: true },
    })

    if (!asset) {
      // 列出该作品最近的候选 ID，让模型直接改用已有候选，而不是重新生成
      const candidates = await prisma.coverAsset.findMany({
        where: { ownerUserId: ctx.userId, novelId: ctx.novelId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true },
      })
      const hint = candidates.length
        ? `该作品已有的候选（最新在前）：${candidates.map((item) => item.id).join('、')}。请从中选一个重新调用 cover_apply，不要重新生成。`
        : '该作品还没有任何封面候选，需要先用 cover_generate 生成。'
      return { output: `封面资源 ${args.coverAssetId} 不存在或不属于当前用户。${hint}` }
    }

    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { coverAssetId: true, title: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    await prisma.$transaction([
      prisma.coverAsset.update({ where: { id: asset.id }, data: { novelId: ctx.novelId } }),
      prisma.novel.update({ where: { id: ctx.novelId }, data: { coverAssetId: asset.id } }),
    ])

    return {
      output: `已把封面应用到作品《${novel.title}》。`,
      summary: `应用封面到《${novel.title}》`,
      display: { kind: 'coverImages', images: [{ id: asset.id, url: asset.imageUrl }] },
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'coverAssetId', previousValue: novel.coverAssetId },
    }
  },
})
