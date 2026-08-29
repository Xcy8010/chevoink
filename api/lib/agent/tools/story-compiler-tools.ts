import { z } from 'zod'

import {
  continuityFindingInputSchema,
  readerPromiseInputSchema,
  sceneTaskInputSchema,
  storyCharterInputSchema,
  storyStateSchema,
} from '../../../../shared/contracts/index.js'
import { generateTextCompletion } from '../../ai-service.js'
import { prisma } from '../../prisma.js'
import {
  commitChapterBridge,
  getStoryCharterBundle,
  prepareStoryCompilation,
  saveReaderPromise,
  saveSceneTasks,
  upsertStoryCharter,
  updateReaderPromise,
  validateStoryContinuity,
} from '../story-compiler.js'
import { defineTool } from './types.js'

const ALL_READ = { plan: 'allow', build: 'allow', review: 'allow' } as const
const PLAN_BUILD_WRITE = { plan: 'allow', build: 'allow', review: 'deny' } as const
const BUILD_WRITE = { plan: 'deny', build: 'allow', review: 'deny' } as const

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const independentContinuityResultSchema = z.object({
  findings: z.array(continuityFindingInputSchema).max(30).default([]),
})

function parseIndependentContinuityResult(content: string) {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('独立连续性检查未返回 JSON 对象。')
  return independentContinuityResultSchema.parse(JSON.parse(content.slice(start, end + 1)))
}

export const storyCharterGetTool = defineTool({
  name: 'story_charter_get',
  title: '读取创作宪章',
  description:
    '读取当前作品的 Story Charter 与尚未兑现的读者承诺。仅在规划新书/长篇结构、准备新章节，或作者询问作品核心承诺时调用；局部润色、改名、查字数时禁止调用。',
  parameters: z.object({}),
  permission: ALL_READ,
  readOnly: true,
  async execute(ctx) {
    const bundle = await getStoryCharterBundle(ctx.userId, ctx.novelId)
    if (!bundle.charter) {
      return { output: '当前作品尚未建立 Story Charter。新书长纲或前三章试制前，应先调用 story_charter_save；旧作可在不阻塞局部编辑的情况下渐进补建。' }
    }
    const charter = bundle.charter
    return {
      output: [
        `Story Charter r${charter.revision}`,
        `一句话承诺：${charter.oneLinePromise}`,
        `目标读者：${charter.targetAudience}${charter.targetPlatform ? `；平台：${charter.targetPlatform}` : ''}`,
        `主角持续欲望：${charter.protagonistDesire}`,
        `恐惧/误信/不可退让：${charter.protagonistFear} / ${charter.protagonistMisbelief} / ${charter.protagonistNonNegotiable}`,
        `冲突引擎：${charter.conflictEngine}`,
        `关系引擎：${charter.relationshipEngine}`,
        `情绪范围：${charter.emotionalBaseline} → ${charter.emotionalRange}`,
        `题材规则：${asStrings(charter.genreRules).join('；') || '无'}`,
        `能力代价：${asStrings(charter.abilityCosts).join('；') || '无'}`,
        `风格 DNA：${asStrings(charter.styleDna).join('；') || '无'}`,
        `禁区：${asStrings(charter.forbiddenZones).join('；') || '无'}`,
        `待兑现承诺：${bundle.promises.map((item) => `${item.title}（promiseId=${item.id}，${item.payoffHorizon}）`).join('；') || '无'}`,
      ].join('\n'),
      summary: `读取创作宪章 r${charter.revision}`,
      display: {
        kind: 'storyCompiler', phase: 'charter', title: '创作宪章',
        detail: `r${charter.revision} · ${bundle.promises.length} 个待兑现承诺`,
        items: [charter.oneLinePromise, `冲突引擎：${charter.conflictEngine}`, `主角欲望：${charter.protagonistDesire}`],
      },
    }
  },
})

export const storyCharterSaveTool = defineTool({
  name: 'story_charter_save',
  title: '保存创作宪章',
  description:
    '创建或修订作品级 Story Charter。作者从一句题材描述开始规划新书、生成长纲或试制前三章时，应先收敛读者承诺、主角驱动力、持续冲突与题材边界后调用；不得把套路模板或未确认的真实事实写入。旧作局部编辑不要求补建。',
  parameters: storyCharterInputSchema,
  permission: PLAN_BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const charter = await upsertStoryCharter(ctx.userId, ctx.novelId, args)
    return {
      output: `已保存 Story Charter r${charter.revision}。后续大纲、Scene Task 与章节桥应以此版本为作品级约束；不要在回复正文重复整份宪章。`,
      summary: `保存创作宪章 r${charter.revision}`,
      display: {
        kind: 'storyCompiler', phase: 'charter', title: '创作宪章已更新',
        detail: `r${charter.revision}`,
        items: [charter.oneLinePromise, `冲突引擎：${charter.conflictEngine}`, `情绪底色：${charter.emotionalBaseline}`],
      },
    }
  },
})

export const readerPromiseSaveTool = defineTool({
  name: 'reader_promise_save',
  title: '记录读者承诺',
  description:
    '记录作品向读者明确许下、后续必须兑现的悬念/关系/成长承诺。仅在新书规划、卷规划或章节产生新的长期承诺时调用；普通场景目标不要滥写为作品级承诺。相同标题会就地更新。',
  parameters: readerPromiseInputSchema,
  permission: PLAN_BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const promise = await saveReaderPromise(ctx.userId, ctx.novelId, args)
    return {
      output: `已记录读者承诺「${promise.title}」，预计兑现窗口：${promise.payoffHorizon}。`,
      summary: `记录读者承诺「${promise.title}」`,
      display: { kind: 'storyCompiler', phase: 'charter', title: '读者承诺', detail: promise.payoffHorizon, items: [promise.promise] },
    }
  },
})

export const readerPromiseUpdateTool = defineTool({
  name: 'reader_promise_update',
  title: '更新读者承诺',
  description:
    '把已有读者承诺标记为已兑现、延期、放弃或重新开启。只有正文确实兑现时才能标记 paid，并记录全书章节序号；只在承诺状态发生变化时调用，禁止每章例行调用。promiseId 来自 story_charter_get。',
  parameters: z.object({
    promiseId: z.string().min(1),
    status: z.enum(['open', 'paid', 'deferred', 'abandoned']),
    paidAtChapter: z.number().int().min(1).optional(),
  }),
  permission: PLAN_BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const promise = await updateReaderPromise({ userId: ctx.userId, novelId: ctx.novelId, ...args })
    const label = { open: '重新开启', paid: '已兑现', deferred: '已延期', abandoned: '已放弃' }[promise.status]
    return {
      output: `读者承诺「${promise.title}」已标记为${label}${promise.paidAtChapter ? `（第 ${promise.paidAtChapter} 章兑现）` : ''}。`,
      summary: `承诺「${promise.title}」${label}`,
      display: { kind: 'storyCompiler', phase: 'charter', title: '读者承诺状态', detail: label, items: [promise.promise] },
    }
  },
})

export const storyCompilerPrepareTool = defineTool({
  name: 'story_compiler_prepare',
  title: '准备章节写作',
  description:
    '新增完整章节、从章尾继续写较长场景、或按计划重写整章前的 PREPARE 步骤：召回 Story Charter、待兑现承诺、前章终态、故事记忆和近期首尾结构，并建立可追踪 Chapter Bridge。局部选区润色/纠错、改标题、调整元数据时禁止调用。新章节尚未创建时传目标全书序号，已有章节传 chapterId。',
  parameters: z.object({
    chapterId: z.string().min(1).optional(),
    targetOrderIndex: z.number().int().min(1).optional(),
    intentSummary: z.string().min(1).max(1000).describe('本轮写作意图的事实化摘要；服务端只保存其 SHA-256，不保存原提示词'),
  }),
  permission: BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const prepared = await prepareStoryCompilation({
      userId: ctx.userId, novelId: ctx.novelId, runId: ctx.runId,
      chapterId: args.chapterId ?? (args.targetOrderIndex === undefined ? ctx.chapterId ?? undefined : undefined),
      targetOrderIndex: args.targetOrderIndex,
      mode: ctx.qualityMode,
      intentSummary: args.intentSummary,
    })
    const bridge = prepared.bridge
    const items = [
      bridge.lastUnfinishedAction ? `未完成动作：${bridge.lastUnfinishedAction}` : '前章无明确未完成动作',
      bridge.location || bridge.storyTime ? `连续时空：${bridge.storyTime || '未标注'} · ${bridge.location || '未标注'}` : '时空状态待 Scene Task 明确',
      bridge.emotionAftermath.length ? `情绪余波：${bridge.emotionAftermath.join('；')}` : '情绪余波待 Scene Task 明确',
      bridge.recentOpenings.length ? `近期避免重复开篇：${bridge.recentOpenings.join(' / ')}` : '无近期开篇样本',
      bridge.openLoops.length ? `开放钩子：${bridge.openLoops.slice(0, 4).join('；')}` : '无已记录开放钩子',
    ]
    return {
      output: `PREPARE 完成，compilationId=${prepared.compilation.id}，目标全书第 ${prepared.compilation.targetOrderIndex} 章。${prepared.charter ? `已加载 Story Charter r${prepared.charter.revision}` : '当前无 Story Charter，旧作可继续，但新书长纲应先建立。'}下一步必须调用 scene_task_build 生成 1–4 个 Scene Task，禁止直接跳到正文。${ctx.qualityMode === 'premium' ? '精品模式必须先比较至少 2 个推进候选，并把候选取舍写入 alternatives。' : ''}\n${items.join('\n')}`,
      summary: `准备第 ${prepared.compilation.targetOrderIndex} 章写作`,
      display: {
        kind: 'storyCompiler', compilationId: prepared.compilation.id, phase: 'prepare', title: '准备章节写作',
        detail: `第 ${prepared.compilation.targetOrderIndex} 章 · ${ctx.qualityMode === 'premium' ? '精品' : '平衡'}`, items,
      },
    }
  },
})

export const sceneTaskBuildTool = defineTool({
  name: 'scene_task_build',
  title: '构建场景任务',
  description:
    'Story Compiler 的 BEAT 步骤。基于 PREPARE 返回的 compilationId，把本章拆成 1–4 个可执行 Scene Task；每个任务必须有目标、阻力、选择、代价、转折和可观测终态。禁止只写“推进剧情/制造冲突”等空泛词，禁止用景物描写代替事件。',
  parameters: z.object({
    compilationId: z.string().min(1),
    tasks: z.array(sceneTaskInputSchema).min(1).max(4),
    alternatives: z.array(z.object({
      label: z.string().min(1).max(120),
      tradeoff: z.string().min(1).max(500),
      rejectedReason: z.string().min(1).max(500),
    })).max(3).default([]).describe('精品模式至少 2 个候选推进及取舍；平衡模式可留空'),
  }),
  permission: BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const tasks = await saveSceneTasks({ userId: ctx.userId, novelId: ctx.novelId, compilationId: args.compilationId, tasks: args.tasks, alternatives: args.alternatives })
    return {
      output: `BEAT 完成，已为 compilationId=${args.compilationId} 建立 ${tasks.length} 个 Scene Task${args.alternatives.length ? `，并记录 ${args.alternatives.length} 个候选推进的取舍` : ''}。现在按顺序写正文；每个场景必须让状态发生变化，写完后调用 continuity_validate。`,
      summary: `建立 ${tasks.length} 个场景任务`,
      display: {
        kind: 'storyCompiler', compilationId: args.compilationId, phase: 'beat', title: '场景任务',
        detail: `${tasks.length} 个场景`, items: tasks.map((task) => `${task.ordinal}. ${task.purpose}｜转折：${task.turn}`),
      },
    }
  },
})

export const chapterBridgeGetTool = defineTool({
  name: 'chapter_bridge_get',
  title: '读取章节桥',
  description:
    '读取当前或最近一次 Story Compiler 的 Chapter Bridge、Scene Task 与阶段状态。续写完整章节前需要核对；局部润色、查标题、改元数据时禁止调用。该工具只读，不会创建新桥；创建写作任务用 story_compiler_prepare。',
  parameters: z.object({ compilationId: z.string().min(1).optional() }),
  permission: ALL_READ,
  readOnly: true,
  async execute(ctx, args) {
    const compilation = await prisma.storyCompilation.findFirst({
      where: { userId: ctx.userId, novelId: ctx.novelId, ...(args.compilationId ? { id: args.compilationId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { bridge: true, sceneTasks: { orderBy: { ordinal: 'asc' } }, chapter: { select: { title: true, revision: true } } },
    })
    if (!compilation?.bridge) return { output: '当前作品没有可读取的 Chapter Bridge。完整章节写作请先调用 story_compiler_prepare。' }
    const bridge = compilation.bridge
    const items = [
      bridge.lastUnfinishedAction ? `未完成动作：${bridge.lastUnfinishedAction}` : '未完成动作：无',
      `地点/时间：${bridge.location || '未标注'} / ${bridge.storyTime || '未标注'}`,
      `人物已知：${asStrings(bridge.knowledgeState).join('；') || '未记录'}`,
      `情绪余波：${asStrings(bridge.emotionAftermath).join('；') || '未记录'}`,
      `物品状态：${asStrings(bridge.objectState).join('；') || '未记录'}`,
      `开放钩子：${asStrings(bridge.openLoops).join('；') || '无'}`,
    ]
    return {
      output: `compilationId=${compilation.id}，阶段=${compilation.stage}，状态=${compilation.status}，目标第 ${compilation.targetOrderIndex} 章。\n${items.join('\n')}\nScene Task：\n${compilation.sceneTasks.map((task) => `${task.ordinal}. ${task.purpose}｜目标 ${task.goal}｜阻力 ${task.obstacle}｜代价 ${task.cost}｜转折 ${task.turn}`).join('\n') || '尚未建立'}`,
      summary: `读取第 ${compilation.targetOrderIndex} 章章节桥`,
      display: { kind: 'storyCompiler', compilationId: compilation.id, phase: compilation.stage, title: '章节桥', detail: `第 ${compilation.targetOrderIndex} 章 · ${compilation.stage}`, items },
    }
  },
})

export const continuityValidateTool = defineTool({
  name: 'continuity_validate',
  title: '检查章节连续性',
  description:
    'Story Compiler 的 CHECK 步骤。在整章/长场景写入后，由服务端启动与 Draft 上下文隔离的连续性编辑，只依据 Chapter Bridge、Scene Task 和当前正文检查人物知识、时空、身体、物品、关系、情绪余波、钩子与首尾结构；同时执行 revision/章序/空正文/Scene Task 数量等确定性硬检查。不得由主写 Agent 自报 findings。',
  parameters: z.object({
    compilationId: z.string().min(1),
    focus: z.string().max(500).optional().describe('作者明确要求额外关注的连续性范围；未指定时不传'),
  }),
  permission: BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const compilation = await prisma.storyCompilation.findFirst({
      where: { id: args.compilationId, userId: ctx.userId, novelId: ctx.novelId, status: 'active' },
      include: { bridge: true, sceneTasks: { orderBy: { ordinal: 'asc' } }, chapter: { select: { id: true, title: true, revision: true, content: true } } },
    })
    if (!compilation?.chapter || !compilation.bridge) return { output: '编译任务不存在或尚未写入目标章节，不能执行独立连续性检查。' }
    const chapter = compilation.chapter
    const bridge = compilation.bridge
    const criticInput = [
        `章节：${chapter.title}@r${chapter.revision}`,
        args.focus ? `额外关注：${args.focus}` : '',
        `前章未完成动作：${bridge.lastUnfinishedAction || '无'}`,
        `连续时空：${bridge.storyTime || '未标注'} / ${bridge.location || '未标注'}`,
        `人物已知：${asStrings(bridge.knowledgeState).join('；') || '未记录'}`,
        `身体状态：${asStrings(bridge.bodyState).join('；') || '未记录'}`,
        `物品状态：${asStrings(bridge.objectState).join('；') || '未记录'}`,
        `关系状态：${asStrings(bridge.relationshipState).join('；') || '未记录'}`,
        `情绪余波：${asStrings(bridge.emotionAftermath).join('；') || '未记录'}`,
        `开放钩子：${asStrings(bridge.openLoops).join('；') || '无'}`,
        `近期首尾：${asStrings(bridge.recentOpenings).join(' / ')}；${asStrings(bridge.recentEndings).join(' / ')}`,
        `Scene Task：\n${compilation.sceneTasks.map((task) => `${task.ordinal}. 目标=${task.goal}；阻力=${task.obstacle}；选择=${task.choice}；代价=${task.cost}；转折=${task.turn}`).join('\n')}`,
        `当前正文：\n${chapter.content.slice(-16000)}`,
      ].filter(Boolean).join('\n')
    const baseCriticPrompt = '你是与正文写作者上下文隔离的中文网文连续性编辑。只依据提供的桥接事实、场景任务和正文找可证实的问题，不续写、不润色、不评价审美。没有问题就返回空数组。严格只输出 JSON：{"findings":[{"signal":"knowledge|location_time|body|object|relationship|emotion|hook|structure","severity":"warning|error","evidence":"正文证据与冲突事实","suggestion":"不改变剧情目标的最小修法"}]}。error 只用于明确事实冲突，审美偏好不得标 error。'
    const criticPrompts = compilation.mode === 'premium'
      ? [
          `${baseCriticPrompt}\n本次重点复核人物知识、关系与情绪余波。`,
          `${baseCriticPrompt}\n本次重点复核时空、身体、物品、钩子和近期首尾结构重复。`,
        ]
      : [baseCriticPrompt]
    const criticResponses = await Promise.all(criticPrompts.map((systemPrompt, index) => generateTextCompletion(
      systemPrompt,
      criticInput,
      { userId: ctx.userId, action: index === 0 ? 'agent3ContinuityCritic' : 'agent3ContinuityCriticSecondPass', novelId: ctx.novelId, chapterId: chapter.id, targetType: 'story_compilation', targetId: compilation.id, temperature: 0.15, reasoningEffort: 'low' },
    )))
    const independentFindings = criticResponses
      .flatMap((response) => parseIndependentContinuityResult(response).findings)
      .filter((finding, index, all) => all.findIndex((item) => item.signal === finding.signal && item.evidence === finding.evidence) === index)
    const result = await validateStoryContinuity({ userId: ctx.userId, novelId: ctx.novelId, compilationId: args.compilationId, findings: independentFindings })
    const phase = result.errorCount > 0 ? 'repair' : 'check'
    return {
      output: result.errorCount > 0
        ? `CHECK 发现 ${result.errorCount} 个错误、${result.warningCount} 个警告。只修有证据的失败项，完成后必须重新调用 continuity_validate；禁止带错提交桥。\n${result.findings.map((item, index) => `${index + 1}. [${item.severity}/${item.signal}] ${item.evidence}；最小修法：${item.suggestion}`).join('\n')}`
        : `CHECK 通过：0 个错误、${result.warningCount} 个警告。可以调用 chapter_bridge_commit 提交本章终态。${result.warningCount ? `\n${result.findings.map((item, index) => `${index + 1}. [警告/${item.signal}] ${item.evidence}`).join('\n')}` : ''}`,
      summary: `连续性检查 · ${result.errorCount} 错误 ${result.warningCount} 警告`,
      display: {
        kind: 'storyCompiler', compilationId: args.compilationId, phase, title: '连续性检查',
        detail: `${result.errorCount} 错误 · ${result.warningCount} 警告`,
        items: result.findings.map((item) => `${item.severity === 'error' ? '错误' : '警告'}：${item.evidence}`),
        errorCount: result.errorCount, warningCount: result.warningCount,
      },
    }
  },
})

export const chapterBridgeCommitTool = defineTool({
  name: 'chapter_bridge_commit',
  title: '提交章节终态',
  description:
    'Story Compiler 的 COMMIT 步骤。仅在 continuity_validate 对当前最新 revision 报告 0 错误后调用；提交本章摘要、人物知识/身体/物品/关系/情绪终态、未完成动作、钩子与首尾结构，供下一章直接桥接，并同步故事记忆。禁止猜测正文没有发生的状态变化。',
  parameters: z.object({
    compilationId: z.string().min(1),
    chapterSummary: z.string().min(1).max(2000),
    exitState: storyStateSchema,
    lastUnfinishedAction: z.string().max(1000).default(''),
    hookDecision: z.string().max(1000).default(''),
    delayedHookReason: z.string().max(1000).default(''),
    openingStructure: z.string().min(1).max(300),
    endingStructure: z.string().min(1).max(300),
  }),
  permission: BUILD_WRITE,
  readOnly: false,
  async execute(ctx, args) {
    const result = await commitChapterBridge({ userId: ctx.userId, novelId: ctx.novelId, ...args })
    return {
      output: `COMMIT 完成，章节 ${result.chapterId}@r${result.chapterRevision} 的 Chapter Bridge、Scene Task 终态与故事记忆已原子对齐。下一章将直接召回本次终态。`,
      summary: '提交章节桥与故事终态',
      display: {
        kind: 'storyCompiler', compilationId: result.compilationId, phase: 'commit', title: '章节终态已提交',
        detail: `r${result.chapterRevision}`, items: [args.chapterSummary, args.lastUnfinishedAction ? `未完成动作：${args.lastUnfinishedAction}` : '未留未完成动作', `结尾结构：${args.endingStructure}`],
      },
    }
  },
})
