import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'

const baseProps = {
  activities: [{ callId: 'call-1', toolName: 'chapter_write', label: '第二章', chapterId: 'c2', deltaChars: 1200, status: 'done' as const }],
  activitiesVersion: 0,
  todos: [{ content: '完成第二章', status: 'completed' as const }],
  todosVersion: 0,
  runActive: false,
  pendingReviewCount: 1,
  reviewBusy: false,
}

describe('Agent activity presentation', () => {
  it('opens dock details by default and keeps review actions compact', () => {
    const markup = renderToStaticMarkup(createElement(AgentActivityBar, { ...baseProps, appearance: 'dock' }))
    expect(markup).toContain('完成第二章')
    expect(markup).toContain('第二章')
    expect(markup).toContain('h-7')
    expect(markup).toContain('flex-col')
    expect(markup).toContain('items-stretch')
    expect(markup).toContain('w-full')
    expect(markup).toContain('justify-start')
    expect(markup).toContain('pl-7')
    expect(markup).not.toContain('justify-end')
  })

  it('keeps the inline activity rows collapsed initially', () => {
    const markup = renderToStaticMarkup(createElement(AgentActivityBar, { ...baseProps, appearance: 'inline' }))
    expect(markup).not.toContain('完成第二章</span>')
  })
})
