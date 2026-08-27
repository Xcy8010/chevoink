import { describe, expect, it } from 'vitest'

import { buildComposerPrompt } from '../../src/features/studio/agent/composer-content'
import type { ComposerReference } from '../../src/features/studio/agent/agentStore'

const reference: ComposerReference = {
  id: 'chapter-1:10-20',
  name: '第一章.md',
  startLine: 2,
  endLine: 4,
  text: '被引用的正文',
  offset: 4,
}

describe('Agent 输入框行内引用', () => {
  it('按照行内位置保留引用前后的提示词', () => {
    const result = buildComposerPrompt('请看这里并续写', [reference])

    expect(result).toContain('请看这里')
    expect(result).toContain('[引用：第一章.md L2-4]')
    expect(result).toContain('被引用的正文')
    expect(result).toContain('并续写')
    expect(result.indexOf('请看这里')).toBeLessThan(result.indexOf('[引用：'))
    expect(result.indexOf('[引用：')).toBeLessThan(result.indexOf('并续写'))
  })

  it('引用从输入框删除后不会残留在发送内容中', () => {
    const result = buildComposerPrompt('只发送这句话', [])

    expect(result).toBe('只发送这句话')
    expect(result).not.toContain('被引用的正文')
    expect(result).not.toContain('[引用：')
  })
})
