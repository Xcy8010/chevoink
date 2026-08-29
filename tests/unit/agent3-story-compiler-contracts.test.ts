import { describe, expect, it } from 'vitest'

import { sceneTaskInputSchema, storyStateSchema } from '../../shared/contracts/index.js'
import { allTools } from '../../api/lib/agent/tools/registry.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'
import { normalizeBeatCandidates } from '../../api/lib/agent/story-compiler.js'

describe('Agent 3.0 Story Compiler 契约', () => {
  it('空的可选状态列表会被标准化，避免桥接出现 undefined 分支', () => {
    expect(storyStateSchema.parse({})).toEqual({ knowledge: [], emotion: [], body: [], objects: [], relationships: [], openLoops: [] })
  })

  it('Scene Task 强制目标、阻力、选择、代价、转折与风格预算', () => {
    expect(() => sceneTaskInputSchema.parse({ purpose: '推进剧情' })).toThrow()
  })

  it('完整章节管线工具全部注册且局部审阅模式不暴露写工具', () => {
    const names = new Set(allTools.map((tool) => tool.name))
    for (const name of ['story_charter_get', 'story_charter_save', 'reader_promise_save', 'reader_promise_update', 'story_compiler_prepare', 'scene_task_build', 'chapter_bridge_get', 'continuity_validate', 'chapter_bridge_commit']) {
      expect(names.has(name), `${name} 未注册`).toBe(true)
    }
    expect(allTools.find((tool) => tool.name === 'chapter_bridge_get')?.readOnly).toBe(true)
    expect(allTools.find((tool) => tool.name === 'chapter_bridge_commit')?.permission.review).toBe('deny')
  })

  it('精品模式与创作自由度分别进入任务契约，避免语义混用', () => {
    const spec = buildTaskSpec({ runId: 'run-premium', novelId: 'novel-1', chapterId: null, prompt: '写下一章', creativeFreedom: 'stable', qualityMode: 'premium' })
    expect(spec).toMatchObject({ creativeFreedom: 'stable', qualityMode: 'premium' })
  })

  it('默认精品且终态提交允许空参数，由服务端解析当前编译状态', () => {
    expect(buildTaskSpec({ runId: 'run-default', novelId: 'novel-1', chapterId: null, prompt: '写下一章', creativeFreedom: 'stable' }).qualityMode).toBe('premium')
    const commit = allTools.find((tool) => tool.name === 'chapter_bridge_commit')
    expect(commit?.parameters.safeParse({}).success).toBe(true)
  })

  it('场景任务不再因精品候选元数据缺失而失败，服务端会补齐两项审计候选', () => {
    const task = sceneTaskInputSchema.parse({
      purpose: '让主角在限时撤离中识别内鬼。',
      entryState: {},
      goal: '抵达撤离点', obstacle: '队伍路线被泄露', choice: '改变路线并暴露自己的怀疑', cost: '失去队友信任',
      turn: '内鬼提前出现在新路线', exitState: {}, styleBudget: { description: 'low', dialogue: 'medium', rhetoric: 'low' },
    })
    const tool = allTools.find((item) => item.name === 'scene_task_build')
    expect(tool?.parameters.safeParse({ tasks: [task] }).success).toBe(true)
    const coerced = tool?.coerceArgs?.({
      scene_tasks: [{
        purpose: task.purpose, goal: task.goal, obstacle: task.obstacle, decision: task.choice,
        consequence: task.cost, twist: task.turn, entry_state: {}, exit_state: {}, style_budget: {},
      }],
      alternatives: null,
    })
    expect(tool?.parameters.safeParse(coerced).success).toBe(true)
    expect(normalizeBeatCandidates([task])).toHaveLength(2)
  })
})
