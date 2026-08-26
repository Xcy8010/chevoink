import { describe, expect, it } from 'vitest'

import {
  containsAgentProtocolArtifact,
  containsAgentProtocolInvocation,
  stripAgentProtocolArtifacts,
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
})
