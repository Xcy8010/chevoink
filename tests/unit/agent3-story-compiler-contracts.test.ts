import { describe, expect, it } from 'vitest'

import { sceneTaskInputSchema, storyStateSchema } from '../../shared/contracts/index.js'
import { allTools } from '../../api/lib/agent/tools/registry.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'

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
})
