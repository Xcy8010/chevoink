import { describe, expect, it } from 'vitest'

import { humanizeAgentVisibleText } from '../../api/lib/agent/visible-text.js'
import { getToolByName } from '../../api/lib/agent/tools/registry.js'

describe('正文信道可见性清洗', () => {
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
