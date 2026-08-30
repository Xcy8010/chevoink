import { describe, expect, it } from 'vitest'

import {
  containsAgentProtocolArtifact,
  containsAgentProtocolInvocation,
  stripAgentProtocolArtifacts,
  recoverAgentProtocolToolCalls,
} from '../../shared/agent-output.js'

describe('Agent 输出协议防泄漏', () => {
  it('清除孤立 invoke 标签但保留正常交付文本', () => {
    const raw = '</invoke>\n\n已完成第二卷续写。'
    expect(containsAgentProtocolArtifact(raw)).toBe(true)
    expect(containsAgentProtocolInvocation(raw)).toBe(false)
    expect(stripAgentProtocolArtifacts(raw)).toBe('已完成第二卷续写。')
  })

  it('整块工具协议不会进入作者可见正文', () => {
    const raw = '<tool_call>{"name":"chapter_create"}</tool_call>\n正文说明'
    expect(containsAgentProtocolInvocation(raw)).toBe(true)
    expect(stripAgentProtocolArtifacts(raw)).toBe('正文说明')
  })

  it('恢复结构完整的 DSML 调用并从正文中彻底清除', () => {
    const raw = `< | | DSML | | tool_calls>\n< | | DSML | | invoke name="chapter_read">\n< | | DSML | | parameter name="chapterId" string="true">chapter-1</ | | DSML | | parameter>\n< | | DSML | | parameter name="limit" string="false">700</ | | DSML | | parameter>\n</ | | DSML | | invoke>\n</ | | DSML | | tool_calls>`
    expect(containsAgentProtocolInvocation(raw)).toBe(true)
    expect(recoverAgentProtocolToolCalls(raw)).toEqual([{ name: 'chapter_read', arguments: '{"chapterId":"chapter-1","limit":700}' }])
    expect(stripAgentProtocolArtifacts(raw)).toBe('')
  })

  it('移除供应商替换字符，避免乱码进入最终正文', () => {
    expect(stripAgentProtocolArtifacts('卷二核���已完成')).toBe('卷二核已完成')
  })
})
