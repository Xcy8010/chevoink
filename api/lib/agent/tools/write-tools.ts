import { z } from 'zod'

import type { Prisma } from '@prisma/client'

import { prisma } from '../../prisma.js'
import { saveStoryMemory } from '../story-memory.js'
import { defineTool } from './types.js'

/**
 * 记忆与计划写工具集。
 * 阶段 P3：章节工具拆至 chapter-tools.ts、作品维度工具拆至 novel-tools.ts，
 * 本文件保留创作记忆沉淀与计划文件夹读写（工具定义逐字不动）。
 */

export const memorySaveTool = defineTool({
  name: 'memory_save',
  title: '沉淀创作记忆',
  description:
    '把重要的设定、角色卡、章节摘要、伏笔或时间线事件保存为长期记忆，供后续 memory_search 检索。只沉淀已被确认的事实，试写内容不沉淀。作者要求修改/覆盖既有设定或角色卡时：先 memory_search 找到原卡片 id，再传 memoryId 就地覆盖（或传 overwrite=true 按同名覆盖），严禁新建同名卡片、严禁把作者明确的修订丢进冲突审核箱。',
  parameters: z.object({
    memoryType: z
      .enum([
        'novelSummary',
        'worldbuilding',
        'characterCard',
        'chapterSummary',
        'timelineEvent',
        'foreshadowing',
        'stylePreference',
        'continuityRule',
        'volumeSummary',
        'storyArc',
        'sceneState',
        'relationshipState',
        'storyBible',
        'authorProfile',
      ])
      .describe('记忆类型'),
    title: z.string().min(1).max(120).describe('记忆标题（如角色名、章节名、设定名）'),
    content: z.string().min(1).max(4000).describe('记忆内容，事实化、结构化表述'),
    importance: z.number().int().min(1).max(100).describe('重要性 1-100：核心主角/主线设定 80+，一般设定 50-70'),
    sourceChapterId: z.string().optional().describe('来源章节 ID（章节摘要必填）'),
    memoryId: z.string().optional().describe('要就地修订的既有记忆卡片 id（来自 memory_search 命中或记忆中心）；作者改设定时必传，禁止另建新卡'),
    overwrite: z.boolean().optional().describe('作者确认式覆盖：同名旧卡直接就地替换，不进冲突审核箱；仅当作者明确要求改设定且拿不到 memoryId 时使用'),
  }),
  coerceArgs(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    let source = raw as Record<string, unknown>
    for (const key of ['arguments', 'args', 'params', 'parameters', 'memory'] as const) {
      const wrapped = source[key]
      if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
        const candidate = wrapped as Record<string, unknown>
        if ([candidate.content, candidate.text, candidate.body, candidate.summary, candidate.title, candidate.name, candidate.subject].some((value) => value !== undefined)) {
          source = { ...candidate, sourceChapterId: source.sourceChapterId ?? candidate.sourceChapterId }
          break
        }
      }
    }
    const result: Record<string, unknown> = { ...source }
    result.memoryType = result.memoryType ?? result.type ?? result.memory_type
    result.title = result.title ?? result.name ?? result.subject
    result.content = result.content ?? result.text ?? result.body ?? result.summary
    result.importance = result.importance ?? result.priority ?? result.weight ?? 70
    result.sourceChapterId = result.sourceChapterId ?? result.chapterId ?? result.source_chapter_id
    if (Array.isArray(result.content)) result.content = result.content.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
    else if (result.content && typeof result.content === 'object') result.content = JSON.stringify(result.content)
    else if (typeof result.content === 'number' || typeof result.content === 'boolean') result.content = String(result.content)
    if (typeof result.title === 'number') result.title = String(result.title)
    if (typeof result.title === 'string') result.title = result.title.trim().slice(0, 120)
    // title 漏填兜底：取正文首句作标题，避免整轮工具调用因参数校验失败作废（作者明确要求兜底）
    if (typeof result.title !== 'string' || !result.title.trim()) {
      const content = typeof result.content === 'string' ? result.content.trim() : ''
      if (content) {
        const firstLine = content.split(/\r?\n/)[0].trim()
        const firstSentence = firstLine.split(/[。！？；!?;]/)[0].trim()
        result.title = (firstSentence || firstLine).slice(0, 40)
      }
    }
    if (typeof result.content === 'string') result.content = result.content.trim().slice(0, 4000)
    const importance = Number(result.importance)
    result.importance = Number.isFinite(importance) ? Math.min(100, Math.max(1, Math.round(importance))) : 70
    if (typeof result.sourceChapterId !== 'string' || !result.sourceChapterId.trim()) delete result.sourceChapterId
    return result
  },
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: false,
  async execute(ctx, args) {
    const result = await saveStoryMemory({
      userId: ctx.userId, novelId: ctx.novelId, runId: ctx.runId,
      sourceChapterId: args.sourceChapterId ?? null, memoryType: args.memoryType,
      layer: ['novelSummary', 'storyBible', 'authorProfile', 'continuityRule'].includes(args.memoryType) ? 'L3' : ['chapterSummary', 'volumeSummary', 'storyArc', 'sceneState', 'relationshipState'].includes(args.memoryType) ? 'L2' : 'L1',
      title: args.title, content: args.content, importance: args.importance,
      confidence: 1, status: 'confirmed',
      memoryId: args.memoryId ?? null,
      overwrite: args.overwrite === true,
      evidence: {
        sourceType: args.sourceChapterId ? 'chapter' : 'author_input',
        sourceId: args.sourceChapterId ?? ctx.runId,
        confidence: 1,
      },
    })
    return {
      output: result.action === 'conflict'
        ? `检测到记忆冲突：[${args.memoryType}] ${args.title} 未覆盖旧事实，候选 ${result.id} 已进入作者审核箱。`
        : `已${result.action === 'created' ? '保存' : '在原卡片上更新'}记忆 [${args.memoryType}] ${args.title}（重要性 ${args.importance}，含来源证据）。`,
      summary: result.action === 'conflict' ? `记忆冲突「${args.title}」` : `沉淀记忆「${args.title}」`,
    }
  },
})

export const planSaveTool = defineTool({
  name: 'plan_save',
  title: '写入计划',
  description:
    '把完整的创作计划/规划文档写入作品树的「计划」文件夹。规划类诉求（如"帮我规划第六章"）完成分析后必须调用本工具落盘完整计划。修订已有计划必须传 planId 就地更新，禁止另存一份同名计划；不传 planId 时若存在同名计划也会自动转为更新。同一次任务里同一份计划只落盘一次，后续都是修订。本工具只用于写入/修订，查看既有计划内容请用只读的 plan_read，禁止用本工具重写一遍来代替读取。不要把计划内容粘贴在回复正文里。',
  parameters: z.object({
    title: z.string().min(2).max(60).describe('计划标题，如"第六章规划"'),
    content: z.string().min(1).describe('完整的计划正文（Markdown）。必须一次传入全文，禁止传 placeholder/待补充等占位文本，否则会被拦截'),
    planId: z
      .string()
      .optional()
      .describe('要修订的既有计划 id（工具返回或上下文提供）。修订已有计划时必传；新建计划时不传'),
  }),
  // 校验前兜底修复：plan_save 是「参数校验失败」小概率事故的高发工具（长上下文下模型偶发
  // planId:null、标题超长/非字符串、参数嵌套一层、别名键），修好再进 zod，避免整次写入作废
  coerceArgs(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return raw
    }

    let obj = raw as Record<string, unknown>

    const asRecord = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null
      return value as Record<string, unknown>
    }
    const parseRecord = (value: unknown): Record<string, unknown> | null => {
      const direct = asRecord(value)
      if (direct) return direct
      if (typeof value !== 'string' || !value.trim().startsWith('{')) return null
      try { return asRecord(JSON.parse(value)) } catch { return null }
    }

    // 模型偶发把参数包在 arguments/args/params 键里（把 function calling 内部结构当成参数），
    // 或该键值为字符串化 JSON：优先解包一层，避免「参数校验失败」把整次写入作废
    const unwrapWrapped = (record: unknown): Record<string, unknown> | null => {
      const candidate = parseRecord(record)
      return candidate && (candidate.title !== undefined || candidate.content !== undefined || candidate.text !== undefined || candidate.markdown !== undefined)
        ? candidate
        : null
    }
    for (const wrapKey of ['arguments', 'args', 'params', 'parameters', 'parameter', 'input', 'payload', 'tool_input', 'plan'] as const) {
      const wrapped = obj[wrapKey]
      const direct = unwrapWrapped(wrapped)
      if (direct) {
        obj = { ...direct, planId: obj.planId ?? direct.planId }
        break
      }
    }

    // 某些兼容层把参数编码成 [{name, value}]，或把 content 再包成 {value/text}。
    const parameterList = Array.isArray(obj.parameters) ? obj.parameters : Array.isArray(obj.params) ? obj.params : null
    if (parameterList) {
      const flattened: Record<string, unknown> = {}
      for (const item of parameterList) {
        const entry = asRecord(item)
        const name = typeof entry?.name === 'string' ? entry.name : typeof entry?.key === 'string' ? entry.key : ''
        if (name) flattened[name] = entry?.value ?? entry?.content ?? entry?.text
      }
      if (flattened.title !== undefined || flattened.content !== undefined) obj = { ...obj, ...flattened }
    }

    // 模型偶发把参数嵌套一层（如 {"plan": {...}}）：根层缺 title/content 时展平
    if (obj.title === undefined && obj.content === undefined) {
      const nested = Object.values(obj).find(
        (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
      ) as Record<string, unknown> | undefined
      if (nested && (nested.title !== undefined || nested.content !== undefined)) {
        obj = { ...nested, planId: obj.planId ?? nested.planId }
      }
    }

    const result: Record<string, unknown> = { ...obj }

    // 别名键兜底
    if (result.title === undefined) {
      result.title = result.name ?? result.planTitle
    }
    if (result.content === undefined) {
      result.content = result.text ?? result.markdown ?? result.body
    }
    if (result.content === 'undefined' || result.content === 'null') delete result.content
    const nestedContent = asRecord(result.content)
    if (nestedContent) {
      result.content = nestedContent.value ?? nestedContent.text ?? nestedContent.markdown ?? nestedContent.body
    }

    // 最后一层保守恢复：根对象里若只有一段明显的长文本，把它视为计划正文；ID、标题与说明不参与。
    if (result.content === undefined) {
      const candidates = Object.entries(result)
        .filter(([key, value]) => !['title', 'name', 'planTitle', 'planId', 'id', 'reason', 'summary'].includes(key) && typeof value === 'string')
        .map(([, value]) => value as string)
        .filter((value) => value.trim().length >= 20)
        .sort((left, right) => right.length - left.length)
      if (candidates[0]) result.content = candidates[0]
    }

    // planId 空值（null 已在 loop 层剔除，这里再防空串）一律视为新建
    if (typeof result.planId !== 'string' || result.planId.trim().length === 0) {
      delete result.planId
    } else {
      result.planId = result.planId.trim()
    }

    // content 段落数组拼成全文
    if (Array.isArray(result.content)) {
      result.content = result.content
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .join('\n')
    } else if (typeof result.content === 'number' || typeof result.content === 'boolean') {
      result.content = String(result.content)
    }

    // title 非字符串/超长/过短兜底：数字转串、超长截断、缺失或过短从正文首个标题行派生
    if (typeof result.title === 'number') {
      result.title = String(result.title)
    }
    if (typeof result.title === 'string') {
      result.title = result.title.trim().slice(0, 60)
    }
    if (typeof result.title !== 'string' || result.title.length < 2) {
      const heading =
        typeof result.content === 'string' ? /^#{1,6}\s*(.+)$/m.exec(result.content)?.[1]?.trim() : undefined
      result.title = (heading && heading.length >= 2 ? heading : '创作计划').slice(0, 60)
    }

    return result
  },
  permission: { plan: 'allow', build: 'allow', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const title = args.title.trim()

    // 优先 planId 精确定位；不传时按同作品同标题兜底去重，防止模型忘传 planId 导致重复落盘
    const existing = args.planId
      ? await prisma.agentArtifact.findFirst({
          where: {
            id: args.planId,
            artifactType: 'chapterPlan',
            run: { userId: ctx.userId, novelId: ctx.novelId },
          },
        })
      : await prisma.agentArtifact.findFirst({
          where: {
            artifactType: 'chapterPlan',
            title,
            metadata: { path: ['savedAsPlan'], equals: true },
            run: { userId: ctx.userId, novelId: ctx.novelId },
          },
          orderBy: { updatedAt: 'desc' },
        })

    if (args.planId && !existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，本次未执行任何写入。请核对 planId，或不传 planId 重试（同名计划会自动就地更新）。`,
        summary: '计划更新失败：planId 不存在',
      }
    }

    // 防误清空护栏：模型偶发把占位文本当正文传入（如 "placeholder"），或把长计划覆盖成几句话，
    // 这里直接拦截不落库，并要求携带完整正文重试，避免既有计划被意外摧毁
    const nextContent = args.content.trim()
    const looksPlaceholder = /^(placeholder|todo|tbd|n\/a|待补充|待填充|待完善|占位|暂无|略)[\s.。…]*$/i.test(nextContent)
    const beforeLength = existing?.content.trim().length ?? 0
    const shrunkTooMuch =
      Boolean(existing) && beforeLength >= 200 && nextContent.length < Math.min(80, Math.ceil(beforeLength * 0.1))
    if (looksPlaceholder || shrunkTooMuch) {
      return {
        output: existing
          ? `已拦截本次计划更新：传入内容疑似占位或不完整（${nextContent.length} 字，原计划 ${beforeLength} 字），计划《${existing.title}》保持原样未被修改。plan_save 必须一次传入完整的计划正文（Markdown 全文），请带上 planId=${existing.id} 和完整内容重新调用；如确需删除计划请改用 plan_delete。`
          : `已拦截本次计划写入：传入内容疑似占位文本（「${nextContent.slice(0, 20)}」），未创建任何计划。请携带完整的计划正文（Markdown 全文）重新调用 plan_save。`,
        summary: '计划写入已拦截：疑似占位/不完整内容',
      }
    }

    if (existing) {
      const beforeTitle = existing.title
      const before = existing.content
      const metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),
        savedAsPlan: true,
      }
      const updated = await prisma.agentArtifact.update({
        where: { id: existing.id },
        data: { title, content: args.content, metadata: metadata as Prisma.InputJsonValue },
      })

      return {
        output: `已就地更新既有计划《${beforeTitle}》（planId=${updated.id}，${args.content.length} 字），没有新建副本，作者会看到变更审查条。回复正文只允许一句话：「已更新计划《${title}》，可在左侧作品树查看。」禁止粘贴计划内容或罗列问题。`,
        summary: `更新计划《${title}》 · ${args.content.length} 字`,
        display: {
          kind: 'planDiff',
          artifactId: updated.id,
          title,
          beforeTitle,
          before,
          after: args.content,
        },
      }
    }

    const artifact = await prisma.agentArtifact.create({
      data: {
        runId: ctx.runId,
        artifactType: 'chapterPlan',
        title,
        content: args.content,
        metadata: { savedAsPlan: true },
      },
    })

    return {
      output: `已把《${title}》写入计划文件夹（planId=${artifact.id}，${args.content.length} 字），作者已能看到并可直接编辑。后续修订请带 planId=${artifact.id} 就地更新。回复正文只允许一句话：「已把《${title}》写入计划文件夹，可在左侧作品树查看和编辑。」禁止粘贴计划内容或罗列问题；如需作者决策请用 ask_user。`,
      summary: `写入计划《${title}》 · ${args.content.length} 字`,
      display: { kind: 'planFile', artifactId: artifact.id, title, content: args.content },
    }
  },
})

export const planRenameTool = defineTool({
  name: 'plan_rename',
  title: '重命名计划',
  description:
    '就地重命名「计划」文件夹里的一份既有计划（只改标题，不动正文）。作者要求改计划名字时必须用本工具，禁止用 plan_save 另存一份新计划。',
  parameters: z.object({
    planId: z.string().min(1).describe('要重命名的计划 id（plan_save 返回或上下文提供）'),
    title: z.string().min(2).max(60).describe('新的计划标题'),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const existing = await prisma.agentArtifact.findFirst({
      where: {
        id: args.planId,
        artifactType: 'chapterPlan',
        run: { userId: ctx.userId, novelId: ctx.novelId },
      },
    })

    if (!existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，未执行重命名。请核对 planId。`,
        summary: '计划重命名失败：planId 不存在',
      }
    }

    const beforeTitle = existing.title
    const title = args.title.trim()
    await prisma.agentArtifact.update({
      where: { id: existing.id },
      data: { title },
    })

    return {
      output: `已把计划《${beforeTitle}》重命名为《${title}》（planId=${existing.id}），没有新建副本。回复正文只允许一句话确认。`,
      summary: `重命名计划《${beforeTitle}》→《${title}》`,
      display: { kind: 'planRename', artifactId: existing.id, beforeTitle, title },
    }
  },
})

export const planDeleteTool = defineTool({
  name: 'plan_delete',
  title: '删除计划',
  description:
    '把一份既有计划从「计划」文件夹移除（不影响对话记录）。仅在作者明确要求删除/移除某份计划时调用。',
  parameters: z.object({
    planId: z.string().min(1).describe('要删除的计划 id'),
  }),
  permission: { plan: 'allow', build: 'ask', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const existing = await prisma.agentArtifact.findFirst({
      where: {
        id: args.planId,
        artifactType: 'chapterPlan',
        run: { userId: ctx.userId, novelId: ctx.novelId },
      },
    })

    if (!existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，未执行删除。请核对 planId。`,
        summary: '计划删除失败：planId 不存在',
      }
    }

    const metadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      savedAsPlan: false,
    }
    await prisma.agentArtifact.update({
      where: { id: existing.id },
      data: { metadata: metadata as Prisma.InputJsonValue },
    })

    return {
      output: `已把计划《${existing.title}》从计划文件夹移除（planId=${existing.id}）。回复正文只允许一句话确认。`,
      summary: `删除计划《${existing.title}》`,
      display: { kind: 'planDelete', artifactId: existing.id, title: existing.title },
    }
  },
})

export const planExitTool = defineTool({
  name: 'plan_exit',
  title: '提交计划',
  description:
    'Plan 模式专用：完成分析后调用此工具提交结构化计划并请求切换到 Build 执行。summary 是一句话总结，steps 是按执行顺序排列的步骤。',
  parameters: z.object({
    summary: z.string().min(1).max(300).describe('计划的一句话总结'),
    steps: z
      .array(
        z.object({
          title: z.string().min(1).max(120).describe('步骤标题'),
          detail: z.string().max(600).optional().describe('步骤说明'),
        }),
      )
      .min(1)
      .max(12)
      .describe('执行步骤列表'),
  }),
  permission: { plan: 'allow', build: 'deny', review: 'deny' },
  readOnly: true,
  async execute(_ctx, args) {
    return {
      output: '计划已提交给用户确认。请停止输出更多内容，等待用户决定是否执行。',
      summary: `提交计划 · ${args.steps.length} 步`,
      display: { kind: 'plan', summary: args.summary, steps: args.steps },
    }
  },
})
