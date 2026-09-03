import { describe, expect, it } from 'vitest'

import { getAgentDefinition, getToolsForAgent } from '../../api/lib/agent/agents.js'
import { AGENT_TOOL_GOVERNANCE } from '../../api/lib/agent/tools/governance.js'
import { getToolByName } from '../../api/lib/agent/tools/registry.js'
import {
  ORCHESTRATION_TOOL_NAMES,
  composeSpawnPrompt,
} from '../../api/lib/agent/tools/task-orchestration-tools.js'

describe('跨任务并行编排工具', () => {
  it('三个编排工具都已注册，且剥除名单恰好覆盖它们', () => {
    expect([...ORCHESTRATION_TOOL_NAMES].sort()).toEqual(['task_send', 'task_spawn', 'task_wait'])
    for (const name of ORCHESTRATION_TOOL_NAMES) {
      expect(getToolByName(name), `${name} 未注册`).toBeDefined()
      expect(AGENT_TOOL_GOVERNANCE[name as keyof typeof AGENT_TOOL_GOVERNANCE], `${name} 未登记治理`).toBeDefined()
    }
  })

  it('派生与投递是写操作需确认，等待是只读', () => {
    expect(getToolByName('task_spawn')?.readOnly).toBe(false)
    expect(getToolByName('task_spawn')?.permission.build).toBe('ask')
    expect(getToolByName('task_send')?.readOnly).toBe(false)
    expect(getToolByName('task_send')?.permission.build).toBe('ask')
    expect(getToolByName('task_wait')?.readOnly).toBe(true)
    expect(getToolByName('task_wait')?.permission.build).toBe('allow')
  })

  it('派生参数默认省 token 的简报模式，任务简报必须写足才能开工', () => {
    const tool = getToolByName('task_spawn')
    const parsed = tool?.parameters.safeParse({ tasks: [{ title: '第 1 章正文', brief: '写第 1 章正文，约 3000 字，沿用现有主角视角与设定。' }] })
    expect(parsed?.success).toBe(true)
    if (parsed?.success) {
      const data = parsed.data as { inherit: string; mode: string }
      expect(data.inherit).toBe('brief')
      expect(data.mode).toBe('build')
    }
    // 简报过短会让派生窗口无从下手，只能回问主控，因此在入参层就拦掉
    expect(tool?.parameters.safeParse({ tasks: [{ title: '第 1 章', brief: '写第一章' }] }).success).toBe(false)
    expect(tool?.parameters.safeParse({ tasks: [] }).success).toBe(false)
    // 简报过长会把整包 tool call 参数顶到输出上限被截断，窗口拿到半截任务，同样在入参层拦掉
    expect(tool?.parameters.safeParse({ tasks: [{ title: '第 1 章', brief: '字'.repeat(401) }] }).success).toBe(false)
    expect(tool?.parameters.safeParse({ tasks: Array.from({ length: 6 }, () => ({ title: 'x', brief: '足够长的任务简报内容用于通过最小长度校验' })) }).success).toBe(false)
  })

  it('coerceArgs 兜底：超额任务裁剪到 5、超长简报/标题截断后仍能过校验，而不是整包打回白耗重试轮', () => {
    const tool = getToolByName('task_spawn')
    const raw = {
      tasks: Array.from({ length: 6 }, (_, i) => ({
        title: `第 ${i + 1} 章正文`.padEnd(80, '标'),
        brief: '写正文'.padEnd(450, '字'),
      })),
    }
    // 原始入参超额 + 超长，裸 schema 会打回
    expect(tool?.parameters.safeParse(raw).success).toBe(false)
    // 走真实链路：先 coerceArgs 兜底再校验，应截断/裁剪后通过
    const coerced = tool?.coerceArgs?.(raw) as { tasks: Array<{ title: string; brief: string }> }
    expect(coerced.tasks).toHaveLength(5)
    for (const task of coerced.tasks) {
      expect(task.title.length).toBeLessThanOrEqual(60)
      expect(task.brief.length).toBeLessThanOrEqual(400)
    }
    expect(tool?.parameters.safeParse(coerced).success).toBe(true)
  })

  it('等待默认等全部结束，超时可续等', () => {
    const tool = getToolByName('task_wait')
    const parsed = tool?.parameters.safeParse({ sessionIds: ['session-b', 'session-c'] })
    expect(parsed?.success).toBe(true)
    if (parsed?.success) {
      const data = parsed.data as { mode: string; timeoutSeconds: number }
      expect(data.mode).toBe('all')
      expect(data.timeoutSeconds).toBe(600)
    }
    expect(tool?.parameters.safeParse({ sessionIds: [] }).success).toBe(false)
    expect(tool?.description).toContain('必须逐个审查交付摘要')
  })

  it('派生提示词强制自包含交付摘要，并按继承方式说明能否沿用主控设定', () => {
    const brief = composeSpawnPrompt('写第 2 章正文，约 3000 字。', 'brief')
    expect(brief).toContain('你没有主控窗口的对话记录')
    expect(brief).toContain('done / blocked')
    expect(brief).toContain('你不能再派生新的任务窗口')

    const transcript = composeSpawnPrompt('写第 3 章正文，约 3000 字。', 'transcript')
    expect(transcript).toContain('继承了主控任务窗口的完整对话记录')
  })

  it('专业子 Agent 拿不到编排工具，只有主控能调度并行窗口', () => {
    for (const type of ['research', 'continuity', 'quality', 'lore']) {
      const names = new Set(getToolsForAgent(getAgentDefinition(type), 'review').map((tool) => tool.name))
      for (const orchestration of ORCHESTRATION_TOOL_NAMES) {
        expect(names.has(orchestration), `${type} 不应拿到 ${orchestration}`).toBe(false)
      }
    }

    const orchestrator = new Set(getToolsForAgent(getAgentDefinition('orchestrator'), 'build').map((tool) => tool.name))
    expect(orchestrator.has('task_spawn')).toBe(true)
    expect(orchestrator.has('task_wait')).toBe(true)
    expect(orchestrator.has('task_send')).toBe(true)
  })
})
