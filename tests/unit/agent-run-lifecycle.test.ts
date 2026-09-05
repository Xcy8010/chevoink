import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AgentStreamEventBody, AgentTodoItem } from '../../shared/contracts/index.js'
import type { AgentTool, ToolResult } from '../../api/lib/agent/tools/types.js'
import type { chatWithTools as chatType } from '../../api/lib/ai-service.js'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(), emit: vi.fn(), persist: vi.fn(async () => ({})),
  update: vi.fn(async () => ({ taskSpec: null })), previous: vi.fn(async () => null),
  todos: vi.fn(async (): Promise<AgentTodoItem[]> => []),
  tools: [] as AgentTool[],
}))
vi.mock('../../api/lib/ai-service.js', () => ({ chatWithTools: mocks.chat }))
vi.mock('../../api/lib/prisma.js', () => ({
  DataAccessError: class extends Error {},
  prisma: {
    agentRun: { update: mocks.update, findFirst: mocks.previous },
    agentSession: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
    agentMessage: { upsert: mocks.persist, findUnique: vi.fn(async () => null) },
  },
}))
vi.mock('../../api/lib/credits.js', () => ({ getModelTierRuntime: vi.fn(async () => ({ tier: 'speed', contextWindowTokens: 128000 })) }))
vi.mock('../../api/lib/agent/agents.js', () => ({
  getAgentDefinition: () => ({ type: 'test', model: 'test', title: '测试' }),
  getToolsForAgent: () => mocks.tools,
  applySessionToolPolicy: (tools: AgentTool[]) => tools,
}))
vi.mock('../../api/lib/agent/tools/registry.js', () => ({ allTools: [], getToolByName: (name: string) => mocks.tools.find(tool => tool.name === name), toOpenAITools: () => [] }))
vi.mock('../../api/lib/agent/active-runs.js', () => ({ registerActiveRun: vi.fn(), deregisterActiveRun: vi.fn() }))
vi.mock('../../api/lib/agent/baseline.js', () => ({ clearRunBaselines: vi.fn() }))
vi.mock('../../api/lib/agent/context.js', () => ({ assembleContext: vi.fn(async () => ({ messages: [] })), insertSubagentCatalog: vi.fn() }))
vi.mock('../../api/lib/agent/context-engine.js', () => ({ captureUserDirectives: vi.fn(), compactSessionContext: vi.fn(async () => null) }))
vi.mock('../../api/lib/agent/story-memory.js', () => ({ syncNovelMemoryProjection: vi.fn(async () => null) }))
vi.mock('../../api/lib/agent2-feature-flags.js', () => ({ resolveAgent2FeatureFlags: () => ({}) }))
vi.mock('../../api/lib/agent/events.js', () => ({ createRunEventBus: () => ({ emit: mocks.emit, emitTransient: mocks.emit }), disposeRunEventBus: vi.fn() }))
vi.mock('../../api/lib/agent/permissions.js', () => ({ cancelAllQuestions: vi.fn(), grantAlwaysAllow: vi.fn(), hasAlwaysAllow: () => false, rejectAllApprovals: vi.fn(), waitForApproval: vi.fn() }))
vi.mock('../../api/lib/agent/tools/todo-tools.js', () => ({ loadSessionTodoItems: mocks.todos, renderTodoItems: (items: AgentTodoItem[]) => JSON.stringify(items) }))
vi.mock('../../api/lib/agent/task-lineage.js', () => ({ getTaskRunIds: async () => ['run'] }))
vi.mock('../../api/lib/agent/tools/task-orchestration-tools.js', () => ({ ORCHESTRATION_TOOL_NAMES: new Set(), assertOrchestrationResumeGuard: vi.fn(), buildOrchestrationResumeNote: vi.fn() }))
vi.mock('../../api/lib/agent/session-title.js', () => ({ autoNameSession: vi.fn() }))

const { executeAgentRun } = await import('../../api/lib/agent/loop.js')
const { env } = await import('../../api/config/env.js')
const { buildTaskSpec } = await import('../../api/lib/agent/task-spec.js')
type Response = Awaited<ReturnType<typeof chatType>>
const response = (content = '已完成。', toolCalls: Response['toolCalls'] = [], tokens = 10): Response => ({ content, toolCalls, reasoning: '', finishReason: toolCalls.length ? 'tool_calls' : 'stop', usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens } })
const call = (id: string, name = 'chapter_read', args = '{}') => ({ id, name, arguments: args })
const events = () => mocks.emit.mock.calls.map(([event]) => event as AgentStreamEventBody)
function tool(name: string, execute: () => Promise<ToolResult>, readOnly = true): AgentTool {
  return { name, title: name, description: '', readOnly, parameters: z.any(), permission: { plan: 'allow', build: 'allow' }, execute: vi.fn(execute) }
}
async function run(prompt = '检查当前章节', tokenBudget?: number) {
  await executeAgentRun({ runId: 'run', sessionId: 'session', userId: 'user', novelId: 'novel', chapterId: null, mode: 'build', prompt, tokenBudget })
  expect(events().filter(event => event.type === 'error')).toEqual([])
}
function queue(...responses: Response[]) {
  for (const item of responses) mocks.chat.mockImplementationOnce(async (input: Parameters<typeof chatType>[0]) => {
    for (const pending of item.toolCalls) input.onChunk?.({ type: 'tool-call-start', id: pending.id, name: pending.name })
    return item
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.chat.mockReset()
  mocks.todos.mockResolvedValue([])
  mocks.previous.mockResolvedValue(null)
  mocks.tools = [tool('chapter_read', async () => ({ output: '当前章节正文' }))]
})

describe('Agent run admission and completion lifecycle (real loop, mocked provider/persistence)', () => {
  it('bounds repeated invalid arguments instead of spending the entire long-task budget', async () => {
    queue(...['bad1', 'bad2', 'bad3'].map(id => response('', [call(id, 'chapter_read', '{')])), response('参数仍无效，已保存进度。'))
    await run()
    expect(mocks.tools[0].execute).not.toHaveBeenCalled()
    expect(mocks.chat).toHaveBeenCalledTimes(4)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'failed' })
  })
  it('never executes a provider-truncated tool even when its JSON can be repaired', async () => {
    queue(response('', [{ ...call('partial', 'chapter_read', '{"chapterId":"c'), incomplete: true }]), response('', [call('valid')]), response())
    await run()
    expect(mocks.tools[0].execute).toHaveBeenCalledTimes(1)
    expect(events().filter(event => event.type === 'tool.result')).toEqual(expect.arrayContaining([
      expect.objectContaining({ callId: 'partial', ok: false }), expect.objectContaining({ callId: 'valid', ok: true }),
    ]))
  })
  it('rejects duplicate calls before any running event/card, retaining one complete call/result pair', async () => {
    queue(response('', [call('a')]), response('', [call('b')]), response())
    await run()
    expect(mocks.tools[0].execute).toHaveBeenCalledTimes(1)
    expect(events().filter(event => event.type === 'tool.call').map(event => event.callId)).toEqual(['a'])
    expect(events().filter(event => event.type === 'tool.result').map(event => event.callId)).toEqual(['a'])
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' })
  })

  it('allows failed calls to retry and new-revision continuity validation to run', async () => {
    let count = 0
    mocks.tools = [tool('continuity_validate', async () => {
      count++
      if (count === 1) throw new Error('temporary failure')
      return count === 2 ? { output: '修订至 r2', display: { kind: 'chapterDiff', chapterId: 'c', chapterTitle: '章', before: '旧', after: '新', appliedDirectly: true, revision: 2 } } : { output: 'r2 已通过' }
    }, false)]
    queue(...['a', 'b', 'c', 'd'].map(id => response('', [call(id, 'continuity_validate')])), response())
    await run()
    expect(count).toBe(3)
    expect(events().filter(event => event.type === 'tool.call')).toHaveLength(3)
    expect(events().filter(event => event.type === 'tool.result')).toHaveLength(3)
  })

  it('typed continue restores pending todos and never reports success on repeated empty steps', async () => {
    mocks.todos.mockResolvedValue([{ content: '完成第七章整改', status: 'pending' }])
    queue(...Array.from({ length: 5 }, () => response('现在写入正文。')))
    await run('请继续完成之前的任务。')
    expect(mocks.todos).toHaveBeenCalledWith('session', ['run'])
    expect(mocks.chat).toHaveBeenCalledTimes(5)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'failed' })
  })

  it('resets consecutive no-progress reminders after actual advancement, supporting more than four milestones', async () => {
    mocks.todos.mockResolvedValue([{ content: '整改全书', status: 'pending' }])
    mocks.tools.push(tool('todo_write', async () => ({ output: '已完成', display: { kind: 'todoList', items: [{ content: '整改全书', status: 'completed' }] } }), false))
    for (let index = 0; index < 7; index++) queue(response('先读取章节。'), response('', [call(`r${index}`, 'chapter_read', JSON.stringify({ chapter: index }))]))
    queue(response('', [call('done', 'todo_write')]), response())
    await run('继续')
    expect(mocks.chat).toHaveBeenCalledTimes(16)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' })
  })

  it('no-tool retries cannot bypass token budget or spend on a wrap-up call after exhaustion', async () => {
    mocks.todos.mockResolvedValue([{ content: '整改', status: 'pending' }])
    queue(response('现在写入正文。', [], 600))
    await run('继续', 500)
    expect(mocks.chat).toHaveBeenCalledTimes(1)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'failed' })
  })

  it('a genuinely new request does not inherit unfinished work', async () => {
    mocks.todos.mockResolvedValue([{ content: '无关旧任务', status: 'pending' }])
    queue(response('这是当前章节的摘要。'))
    await run('总结当前章节')
    expect(mocks.todos).not.toHaveBeenCalled()
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' })
  })

  it('inherits the original goal on a typed continuation and persists it on the new run', async () => {
    const taskSpec = buildTaskSpec({ runId: 'original', novelId: 'novel', chapterId: null, prompt: '整改前七章的人物动机' })
    mocks.previous.mockResolvedValue({ taskSpec } as never)
    mocks.todos.mockResolvedValue([{ content: '整改前七章', status: 'completed' }])
    queue(response())
    await run('请继续完成之前的任务。')
    expect(mocks.update.mock.calls).toContainEqual([{ where: { id: 'run' }, data: { taskSpec: { ...taskSpec, runId: 'run' } } }])
  })

  it('does not stop a batch that contains duplicates followed by new productive work', async () => {
    queue(response('', [call('a')]), response('', [...Array.from({ length: 4 }, (_, i) => call(`dup${i}`)), call('fresh', 'chapter_read', '{"chapter":2}')]), response())
    await run()
    expect(mocks.tools[0].execute).toHaveBeenCalledTimes(2)
    expect(mocks.chat).toHaveBeenCalledTimes(3)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' })
  })

  it('permits identical todo arguments to advance an atomically accepted partial completion', async () => {
    let completed = 0
    const items: AgentTodoItem[] = [{ content: '一', status: 'in_progress' }, { content: '二', status: 'pending' }]
    mocks.todos.mockResolvedValue(items)
    mocks.tools = [tool('todo_write', async () => ({ output: `完成${++completed}项`, display: { kind: 'todoList', items: items.map((item, i) => ({ ...item, status: i < completed ? 'completed' : 'in_progress' })) } }))]
    queue(response('', [call('t1', 'todo_write')]), response('', [call('t2', 'todo_write')]), response())
    await run('继续')
    expect(completed).toBe(2)
    expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' })
  })

  it('auto-renews a productive checkpoint by two million tokens but stops at the run hard ceiling', async () => {
    const original = env.agentRunTokenBudgetCeiling
    env.agentRunTokenBudgetCeiling = 1200
    try {
      mocks.todos.mockResolvedValue([{ content: '整改', status: 'pending' }])
      mocks.tools = [tool('chapter_write', async () => ({ output: '已保存', display: { kind: 'chapterDiff', chapterId: 'c', chapterTitle: '章', before: '旧', after: '新', appliedDirectly: true } }), false)]
      queue(response('', [call('write', 'chapter_write')], 600), response('现在修订下一章。', [], 600))
      await run('继续', 500)
      expect(mocks.chat).toHaveBeenCalledTimes(2)
      expect(events().filter(event => event.type === 'text.final' && event.text.includes('已到检查点'))).toHaveLength(1)
      expect(events().at(-1)).toMatchObject({ type: 'run.finished', status: 'failed' })
    } finally { env.agentRunTokenBudgetCeiling = original }
  })
})
