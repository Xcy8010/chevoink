import { describe, expect, it } from 'vitest'

import { buildComposerPrompt } from '../../src/features/studio/agent/composer-content'
import type { ComposerReference } from '../../src/features/studio/agent/agentStore'

const reference: ComposerReference = {
  id: 'chapter-1:10-20',
  kind: 'chapter',
  name: '第一章',
  startLine: 2,
  endLine: 4,
  text: '被引用的正文',
  offset: 4,
}

describe('Agent 输入框行内引用', () => {
  it('按照行内位置保留引用前后的提示词', () => {
    const result = buildComposerPrompt('请看这里并续写', [reference])

    expect(result).toContain('请看这里')
    expect(result).toContain('[章节引用：第一章 L2-4]')
    expect(result).toContain('被引用的正文')
    expect(result).toContain('并续写')
    expect(result.indexOf('请看这里')).toBeLessThan(result.indexOf('[章节引用：'))
    expect(result.indexOf('[章节引用：')).toBeLessThan(result.indexOf('并续写'))
  })

  it.each([
    ['catalog' as const, '目录', '[目录引用：目录 L2-4]'],
    ['plan' as const, '第三卷规划', '[计划引用：第三卷规划 L2-4]'],
  ])('为 %s 引用保留业务类型且不伪装成 Markdown 文件', (kind, name, expected) => {
    const result = buildComposerPrompt('', [{ ...reference, kind, name, offset: 0 }])

    expect(result).toContain(expected)
    expect(result).not.toContain('.md')
  })

  it('引用从输入框删除后不会残留在发送内容中', () => {
    const result = buildComposerPrompt('只发送这句话', [])

    expect(result).toBe('只发送这句话')
    expect(result).not.toContain('被引用的正文')
    expect(result).not.toContain('引用：')
  })
})
