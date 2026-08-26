import { beforeEach, describe, expect, it } from 'vitest'

import { useAgentStore } from '../../src/features/studio/agent/agentStore'

describe('Agent 写入审查生命周期', () => {
  beforeEach(() => {
    useAgentStore.getState().resetRun()
    useAgentStore.getState().resumeRun('run-review', 'session-review')
  })

  it('执行成功先保持已完成，作者采纳后才标记已接受', () => {
    const apply = useAgentStore.getState().applyEvent
    apply({ seq: 1, runId: 'run-review', ts: new Date().toISOString(), type: 'message.start', messageId: 'message-review', role: 'assistant' })
    apply({ seq: 2, runId: 'run-review', ts: new Date().toISOString(), type: 'tool.call', messageId: 'message-review', callId: 'call-review-lifecycle', toolName: 'chapter_write', title: '写入章节正文', args: {} })
    apply({
      seq: 3,
      runId: 'run-review',
      ts: new Date().toISOString(),
      type: 'tool.result',
      messageId: 'message-review',
      callId: 'call-review-lifecycle',
      toolName: 'chapter_write',
      ok: true,
      summary: '正文已写入',
      durationMs: 1200,
      display: { kind: 'chapterDiff', chapterId: 'chapter-review', chapterTitle: '测试章', before: '', after: '新正文', appliedDirectly: true },
    })

    const completed = useAgentStore.getState().messages[0]?.parts.find((part) => part.type === 'tool-call')
    expect(completed?.type === 'tool-call' && completed.status).toBe('success')
    expect(completed?.type === 'tool-call' && completed.accepted).toBeFalsy()

    useAgentStore.getState().markWorkspaceActivitiesAccepted({ chapterId: 'chapter-review' })

    const accepted = useAgentStore.getState().messages[0]?.parts.find((part) => part.type === 'tool-call')
    expect(accepted?.type === 'tool-call' && accepted.accepted).toBe(true)
    expect(useAgentStore.getState().workspaceActivities[0]?.accepted).toBe(true)
  })
})
