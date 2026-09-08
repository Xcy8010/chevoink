import { describe, expect, it } from 'vitest'

import {
  containsAgentProtocolArtifact,
  containsAgentProtocolInvocation,
  stripAgentProtocolArtifacts,
  recoverAgentProtocolToolCalls,
  countReportChineseCharacters,
} from '../../shared/agent-output.js'

describe('Agent 输出协议防泄漏', () => {
  it('counts visible report Chinese, not code, URLs, images or repeated blocks', () => {
    expect(countReportChineseCharacters('# 标题\n\n人物选择推动冲突。\n\n人物选择推动冲突。\n\n`不计代码`\n\n```text\n代码不计\n```\n\n![图片不计](https://example.com/图)\n\n[证据](https://example.com/中文)')).toBe(12)
    expect(countReportChineseCharacters('https://example.com/中文')).toBe(0)
    expect(countReportChineseCharacters('正文。\n\n<invoke name="tool">\n\n隐藏内容不能凑字数。\n\n</invoke>')).toBe(2)
  })
  it.each([
    '```xml\n<invoke name="chapter_read"><parameter name="chapterId">example</parameter></invoke>\n```',
    '~~~~xml\n<invoke name="chapter_read"></invoke>\n~~~~',
    '```json\n{"sample":"<invoke name=\\"chapter_read\\"></invoke>"}',
    '    <invoke name="chapter_read"></invoke>',
    '例子：`<invoke name="chapter_read"></invoke>`。',
    '- 示例：\n\n  ```xml\n  <invoke name="chapter_read"></invoke>\n  ```',
  ])('never strips or executes a Markdown code example: %s', raw => {
    expect(containsAgentProtocolArtifact(raw)).toBe(false)
    expect(containsAgentProtocolInvocation(raw)).toBe(false)
    expect(recoverAgentProtocolToolCalls(raw)).toEqual([])
    expect(stripAgentProtocolArtifacts(raw)).toBe(raw)
  })
  it('still recovers the real call after a code example without merging their arguments', () => {
    const example = '```xml\n<invoke name="chapter_write"><parameter name="content">example only</parameter></invoke>\n```'
    const real = '<invoke name="chapter_read"><parameter name="chapterId" string="true">actual</parameter></invoke>'
    const text = example + '\n\n' + real
    expect(recoverAgentProtocolToolCalls(text)).toEqual([{ name: 'chapter_read', arguments: '{"chapterId":"actual"}' }])
    expect(stripAgentProtocolArtifacts(text)).toBe(example)
  })
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
