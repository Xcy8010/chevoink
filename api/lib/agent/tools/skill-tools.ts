import { z } from 'zod'

import { generateTextCompletion } from '../../ai-service.js'
import { prisma } from '../../prisma.js'
import { loadSkill, skillCatalog, type CreativeFreedom, type SkillPhase } from '../skills/index.js'
import { defineTool } from './types.js'

const FREEDOM = z.enum(['stable', 'balanced', 'bold']).default('balanced')
const PHASE = z.enum(['draft', 'critique', 'revision'])

export const skillCatalogTool = defineTool({
  name: 'skill_catalog', title: '查看创作能力',
  description: '查看可用 Skill 2.0 元数据。Skill 都是软技巧，不是强制检查表；按任务最多组合三个。',
  parameters: z.object({ phase: PHASE.optional() }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' }, readOnly: true,
  async execute(_ctx, args) {
    const items = args.phase ? skillCatalog.filter((item) => item.phases.includes(args.phase!)) : skillCatalog
    return {
      output: items.map((item) => `${item.id}@${item.version} [${item.phases.join('/')}] ${item.synopsis}${item.attribution ? ` 来源说明：${item.attribution}` : ''}`).join('\n'),
      summary: `创作能力 · ${items.length} 项`,
    }
  },
})

export const skillLoadTool = defineTool({
  name: 'skill_load', title: '加载创作能力',
  description: '按 draft/critique/revision 阶段加载一个 Skill 的精简资源。只在候选确实有帮助时调用，最多加载三个。',
  parameters: z.object({ skillId: z.string().min(1), phase: PHASE, creativeFreedom: FREEDOM }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' }, readOnly: true,
  async execute(_ctx, args) {
    const content = loadSkill(args.skillId, args.phase, args.creativeFreedom)
    return content
      ? { output: content, summary: `加载 ${args.skillId} · ${args.phase}` }
      : { output: `Skill ${args.skillId} 不存在或不支持 ${args.phase} 阶段。` }
  },
})

function skillResources(skillIds: string[], phase: SkillPhase, freedom: CreativeFreedom): string {
  return skillIds.map((id) => loadSkill(id, phase, freedom)).filter(Boolean).join('\n\n')
}

async function ownedChapter(userId: string, novelId: string, chapterId: string) {
  return prisma.chapter.findFirst({ where: { id: chapterId, novelId, authorId: userId }, select: { id: true, title: true, content: true, revision: true } })
}

export const creativeCritiqueTool = defineTool({
  name: 'creative_critique', title: '独立创作批评',
  description: '在与 Draft 分离的模型上下文中审阅指定正文，只给有原文证据的问题，不改正文。结果保存为审阅产物，供作者选择。',
  parameters: z.object({
    chapterId: z.string().min(1), start: z.number().int().min(0).optional(), end: z.number().int().positive().optional(),
    skillIds: z.array(z.string()).min(1).max(3), creativeFreedom: FREEDOM,
  }),
  permission: { plan: 'deny', build: 'allow', review: 'allow' }, readOnly: false,
  async execute(ctx, args) {
    const chapter = await ownedChapter(ctx.userId, ctx.novelId, args.chapterId)
    if (!chapter) return { output: '章节不存在或不属于当前作品。' }
    const start = args.start ?? 0
    const end = Math.min(args.end ?? chapter.content.length, chapter.content.length)
    const text = chapter.content.slice(start, end)
    const resources = skillResources(args.skillIds, 'critique', args.creativeFreedom)
    const critique = await generateTextCompletion(
      `你是与写作者上下文隔离的小说批评编辑。只依据给定原文指出问题，不续写、不改写、不套固定检查表。每条含编号、短引文、问题和修改方向；把事实硬伤与审美建议分开。\n${resources}`,
      `章节：${chapter.title}，revision=${chapter.revision}，范围=[${start},${end})\n原文：\n${text}`,
      { userId: ctx.userId, action: 'agentCreativeCritique', novelId: ctx.novelId, chapterId: chapter.id, targetType: 'chapter', targetId: chapter.id, temperature: 0.25 },
    )
    const artifact = await prisma.agentArtifact.create({
      data: { runId: ctx.runId, artifactType: 'continuityReview', title: `${chapter.title} · 独立批评`, content: critique, summary: `revision ${chapter.revision} / ${args.skillIds.join(',')}`, metadata: { chapterId: chapter.id, revision: chapter.revision, start, end, skillIds: args.skillIds, phase: 'critique' } },
    })
    return { output: `独立批评已保存为 artifactId=${artifact.id}。\n${critique.slice(0, 5000)}`, summary: `独立批评《${chapter.title}》` }
  },
})

export const creativeRevisionDraftTool = defineTool({
  name: 'creative_revision_draft', title: '生成选择性修订稿',
  description: '在独立 Revision 上下文中，只根据作者选中的批评项生成修订稿；不直接写入章节，返回 artifactId 和草稿供主 Agent 用精准编辑工具应用。',
  parameters: z.object({
    critiqueArtifactId: z.string().min(1), chapterId: z.string().min(1), selectedFindings: z.array(z.string().min(1)).min(1).max(12),
    start: z.number().int().min(0).optional(), end: z.number().int().positive().optional(), skillIds: z.array(z.string()).min(1).max(3), creativeFreedom: FREEDOM,
  }),
  permission: { plan: 'deny', build: 'allow', review: 'deny' }, readOnly: false,
  async execute(ctx, args) {
    const [chapter, critique] = await Promise.all([
      ownedChapter(ctx.userId, ctx.novelId, args.chapterId),
      prisma.agentArtifact.findFirst({ where: { id: args.critiqueArtifactId, run: { userId: ctx.userId, novelId: ctx.novelId } } }),
    ])
    if (!chapter || !critique) return { output: '章节或批评产物不存在，或不属于当前作品。' }
    const metadata = critique.metadata as { revision?: unknown } | null
    if (metadata?.revision !== chapter.revision) return { output: `章节已从批评时的 revision=${String(metadata?.revision)} 变为 ${chapter.revision}，请重新批评，避免基于旧文本修订。` }
    const start = args.start ?? 0
    const end = Math.min(args.end ?? chapter.content.length, chapter.content.length)
    const source = chapter.content.slice(start, end)
    const resources = skillResources(args.skillIds, 'revision', args.creativeFreedom)
    const revised = await generateTextCompletion(
      `你是与 Draft/Critique 上下文隔离的修订编辑。只落实 selectedFindings，不顺手应用其他建议，不改变未授权事实和情节。只输出可替换原文的修订文本。\n${resources}`,
      `作者选中的批评项：\n${args.selectedFindings.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n待修订原文：\n${source}`,
      { userId: ctx.userId, action: 'agentCreativeRevision', novelId: ctx.novelId, chapterId: chapter.id, targetType: 'chapter', targetId: chapter.id, temperature: args.creativeFreedom === 'stable' ? 0.35 : args.creativeFreedom === 'bold' ? 0.75 : 0.55 },
    )
    const artifact = await prisma.agentArtifact.create({
      data: { runId: ctx.runId, artifactType: 'rewriteSelection', title: `${chapter.title} · 选择性修订稿`, content: revised, summary: `${args.selectedFindings.length} 项选中意见`, metadata: { chapterId: chapter.id, revision: chapter.revision, start, end, critiqueArtifactId: critique.id, phase: 'revision' } },
    })
    return { output: `选择性修订稿已保存为 artifactId=${artifact.id}，尚未写入章节。\n${revised.slice(0, 8000)}`, summary: `生成选择性修订稿《${chapter.title}》` }
  },
})
