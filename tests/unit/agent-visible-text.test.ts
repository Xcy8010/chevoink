import { describe, expect, it } from 'vitest'

import { createVisibleTextStreamer, humanizeAgentVisibleText } from '../../api/lib/agent/visible-text.js'
import { getToolByName } from '../../api/lib/agent/tools/registry.js'

describe('正文信道可见性清洗', () => {
  it('keeps source URLs and code examples byte-for-byte while humanizing operational prose', () => {
    const source = 'https://example.com/chapter_read?chapterId=cmttleebg03h9wqox9lieracs'
    const code = '```json\n{"chapterId":"cmttleebg03h9wqox9lieracs","tool":"chapter_read"}\n```'
    const raw = `调用 chapter_read。\n\n[chapter_read](${source})\n\n${source}\n\n${code}\n\n参数示例：\`chapterId\`。`
    const cleaned = humanizeAgentVisibleText(raw)
    expect(cleaned).toContain(`调用 ${getToolByName('chapter_read')!.title}。`)
    expect(cleaned).toContain(`[chapter_read](${source})`)
    expect(cleaned).toContain(code)
    expect(cleaned).toContain('`chapterId`')
  })
  it('工具英文名替换为注册表中文工具名', () => {
    const out = humanizeAgentVisibleText('scene_task_build 参数需平铺传递，重新发起。用了 chapter_write 写前半，chapter_append 追加后半。')
    expect(out).not.toContain('scene_task_build')
    expect(out).not.toContain('chapter_write')
    expect(out).not.toContain('chapter_append')
    expect(out).toContain('构建场景任务')
  })

  it('内部系统英文名替换为中文功能名', () => {
    const out = humanizeAgentVisibleText('正文完成，进入 Story Compiler 校验流程；Chapter Bridge 与章节记忆已提交。')
    expect(out).not.toContain('Story Compiler')
    expect(out).not.toContain('Chapter Bridge')
    expect(out).toContain('剧情编译')
    expect(out).toContain('章节桥')
  })

  it('普通中英文内容不被误伤', () => {
    const plain = '第10章《回援》已完成落库：正文4129字，连续性检查0错误0警告。'
    expect(humanizeAgentVisibleText(plain)).toBe(plain)
  })

  it('camelCase 参数名与不透明编号同样不进信道', () => {
    const out = humanizeAgentVisibleText('拿到 compilationId=cmttleebg03h9wqox9lieracs，调用 scene_task_build 补齐场景任务。')
    expect(out).not.toContain('compilationId')
    expect(out).not.toContain('cmttleebg03h9wqox9lieracs')
    expect(out).not.toContain('scene_task_build')
    expect(out).toContain('编译编号')
    expect(out).toContain('编号')
    expect(out).toContain('构建场景任务')
  })
})

describe('可见信道流式清洗器', () => {
  it('preserves incomplete inline code and late reference labels without reverting streamed text', () => {
    for (const chunks of [
      ['参数示例：`chapter', 'Id=cmttleebg03h9wqox9lieracs', '`，完成。'],
      ['来源：[chapter', '_read][book', '_source]。\n\n', '[book_source]: https://example.com/book?id=19\n'],
      ['来源：[chapter', '_read](https://example.com/read?chapterId=', 'cmttleebg03h9wqox9lieracs', ')。'],
    ]) {
      const streamer = createVisibleTextStreamer()
      expect(chunks.map(chunk => streamer.push(chunk)).join('')).toBe(chunks.join(''))
    }
  })
  it('does not rewrite a streamed fenced code block or a split source URL', () => {
    const streamer = createVisibleTextStreamer()
    const chunks = ['示例：\n\n```json\n', '{"chapterId":"cmtt', 'leebg03h9wqox9lieracs"}\n', '```\n\nhttps://example.com/chapter_read?chapterId=', 'cmttleebg03h9wqox9lieracs', '\n完成。']
    expect(chunks.map(chunk => streamer.push(chunk)).join('')).toBe(chunks.join(''))
  })
  it('流式增量逐段清洗：英文名在流式期间就不播出，而非轮末二次修正', () => {
    const streamer = createVisibleTextStreamer()
    const chunks = ['进入校验：scene', '_task_bu', 'ild，准备', '补场景。']
    const streamed = chunks.map((chunk) => streamer.push(chunk)).join('')
    // 流式拼接结果里任何时刻都不该出现英文工具名
    expect(streamed).not.toContain('scene_task_build')
    expect(streamed).toContain('构建场景任务')
    expect(streamed).toContain('进入校验：')
  })

  it('尾部未完成标识符先扣留：已知名前缀与成长中的编号不提前漏出', () => {
    const streamer = createVisibleTextStreamer()
    const first = streamer.push('调用 scene_task')
    expect(first).not.toContain('scene_task')
    const second = streamer.push('_build 完成')
    expect(second).toContain('构建场景任务')

    const idStreamer = createVisibleTextStreamer()
    const partial = idStreamer.push('编译桥 cmttleebg03h')
    expect(partial).not.toContain('cmttleebg03h')
    const rest = idStreamer.push('9wqox9lieracs 已确认')
    expect(rest).not.toContain('cmttleebg03h9wqox9lieracs')
    expect(rest).toContain('编号')
  })
})

describe('scene_task_build 参数信封兜底', () => {
  it('解包 object 形态 arguments 信封', () => {
    const tool = getToolByName('scene_task_build')
    const coerced = tool?.coerceArgs?.({ arguments: { tasks: [{ goal: '守城夜战' }] } }) as Record<string, unknown>
    expect(Array.isArray(coerced?.tasks)).toBe(true)
  })

  it('解包字符串化 JSON 形态 arguments 信封', () => {
    const tool = getToolByName('scene_task_build')
    const coerced = tool?.coerceArgs?.({ arguments: '{"tasks": [{"goal": "守城夜战"}]}' }) as Record<string, unknown>
    expect(Array.isArray(coerced?.tasks)).toBe(true)
  })

  it('平铺参数原样通过', () => {
    const tool = getToolByName('scene_task_build')
    const coerced = tool?.coerceArgs?.({ tasks: [{ goal: '守城夜战' }] }) as Record<string, unknown>
    expect(Array.isArray(coerced?.tasks)).toBe(true)
  })
})
