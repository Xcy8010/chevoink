import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'
const baseProps = {
  activities: [{ callId: 'call-1', toolName: 'chapter_write', label: '第二章', chapterId: 'c2', deltaChars: 2, before: '', after: '正文', status: 'done' as const }],
  activitiesVersion: 0,
  todos: [{ content: '完成第二章', status: 'completed' as const }],
  todosVersion: 0, runActive: false, pendingReviewCount: 1, reviewBusy: false,
}
describe('Agent activity presentation', () => {
  it.each(['dock', 'inline'] as const)('uses matching centered capsules in %s without auto-opening details', appearance => {
    const markup = renderToStaticMarkup(createElement(AgentActivityBar, { ...baseProps, appearance }))
    expect(markup).toContain('data-agent-activity-capsules')
    expect(markup).toContain('flex-wrap items-center justify-center gap-2')
    expect(markup).toContain('1 个工作区变更')
    expect(markup).toContain('1/1')
    expect(markup).toContain('全部完成')
    expect(markup).toContain('新增 2 字')
    expect(markup).toContain('接受全部')
    expect(markup).toContain('拒绝全部')
    expect(markup).not.toContain('role="dialog"')
    expect(markup).not.toContain('aria-expanded="true"')
  })
})
