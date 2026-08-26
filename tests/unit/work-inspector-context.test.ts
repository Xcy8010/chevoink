import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AgentTaskRail } from '../../src/features/studio/components/AgentTaskSidebar'
import WorkInspector from '../../src/features/studio/components/WorkInspector'
import { formatContextTokenCount } from '../../src/features/studio/agent/lib/context-format'

describe('Work workspace navigation and context', () => {
  it('formats context usage in k units without locale-specific 万 labels', () => {
    expect(formatContextTokenCount(11_000)).toBe('11k')
    expect(formatContextTokenCount(128_000)).toBe('128k')
    expect(formatContextTokenCount(11_500)).toBe('11.5k')
  })

  it('renders one rail marker per task and marks the active task', () => {
    const markup = renderToStaticMarkup(createElement(AgentTaskRail, {
      taskWindows: [
        { id: 'task-a', title: '任务 A', updatedAt: '', temporary: false, prompt: '', artifactsCount: 0 },
        { id: 'task-b', title: '任务 B', updatedAt: '', temporary: false, prompt: '', artifactsCount: 0 },
        { id: 'task-c', title: '任务 C', updatedAt: '', temporary: false, prompt: '', artifactsCount: 0 },
      ],
      activeTaskWindowId: 'task-b',
      taskSwitchLocked: false,
      onExpand: () => undefined,
      onCreateTaskWindow: () => undefined,
      onSelectTaskWindow: () => undefined,
    }))

    expect(markup.match(/aria-label="任务 [ABC]"/g)).toHaveLength(3)
    expect(markup).toMatch(/aria-label="任务 B"[^>]*aria-current="page"/)
  })

  it('renders the conversation context panel instead of duplicating project structure', () => {
    const markup = renderToStaticMarkup(createElement(WorkInspector, {
      tab: 'context',
      onTabChange: () => undefined,
      workTree: null,
      novelTitle: '锈海之门',
      volumeTitle: '门后的真相',
      chapterTitle: '后门',
      chapterCount: 2,
      wordCount: '1985 字',
      pendingReviewCount: 0,
      selectedTextLength: 24,
      activeArtifactTitle: '第二卷规划',
      volumes: [
        { id: 'v1', novelId: 'n1', title: '事故与逃亡', summary: null, orderIndex: 1, revision: 1, chapterCount: 1, wordCount: 1200 },
        { id: 'v2', novelId: 'n1', title: '门后的真相', summary: null, orderIndex: 2, revision: 1, chapterCount: 1, wordCount: 1985 },
      ],
      chapters: [
        { id: 'c1', novelId: 'n1', title: '第零号信号', summary: null, orderIndex: 1, volumeId: 'v1', orderInVolume: 1, wordCount: 1200, status: 'draft', visibility: 'private', commentCount: 0, revision: 1, publishedAt: null },
        { id: 'c2', novelId: 'n1', title: '后门', summary: null, orderIndex: 2, volumeId: 'v2', orderInVolume: 1, wordCount: 1985, status: 'draft', visibility: 'private', commentCount: 0, revision: 1, publishedAt: null },
      ],
      plans: [{ id: 'p1', title: '第十三至十五章大纲', content: '...', createdAt: '', artifactId: 'a1' }],
      projectNotes: { genre: '科幻悬疑', protagonist: '林渡', tone: '冷峻', outlineLength: 'medium', stylePreference: '克制写实' },
      activeTaskTitle: '续写第二卷',
      taskCount: 3,
      contextPanel: createElement('div', null, '会话上下文 · 42% · 手动压缩当前会话'),
    }))

    expect(markup).toContain('会话上下文 · 42% · 手动压缩当前会话')
    expect(markup).not.toContain('作品结构 · 2 卷 2 章')
    expect(markup).not.toContain('科幻悬疑')
  })

  it('hides zero-value change deltas while retaining actual additions and deletions', () => {
    const markup = renderToStaticMarkup(createElement(WorkInspector, {
      tab: 'changes',
      onTabChange: () => undefined,
      workTree: null,
      novelTitle: '锈海之门',
      chapterTitle: '后门',
      chapterCount: 2,
      wordCount: '1985 字',
      pendingReviewCount: 0,
      contextPanel: null,
      activities: [
        { callId: 'memory-1', toolName: 'memory_save', label: '更新作品记忆', chapterId: null, deltaChars: 0, status: 'done' },
        { callId: 'chapter-1', toolName: 'chapter_write', label: '后门', chapterId: 'chapter-1', deltaChars: 1699, status: 'done' },
        { callId: 'chapter-2', toolName: 'chapter_edit_range', label: '后门', chapterId: 'chapter-1', deltaChars: -32, status: 'done' },
      ],
    }))

    expect(markup).not.toMatch(/>\+0<|>-0</)
    expect(markup).toContain('+1699')
    expect(markup).toContain('-32')
  })
})
