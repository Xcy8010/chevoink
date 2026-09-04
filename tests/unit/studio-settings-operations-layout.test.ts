import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('创作区设置与 Agent 操作信息架构', () => {
  it('全屏设置只保留返回入口，不再渲染重复的右上角关闭按钮', () => {
    const settings = read('src/features/studio/components/StudioSettingsDialog.tsx')
    expect(settings).toContain('返回创作区')
    expect(settings).not.toContain('aria-label="关闭设置"')
  })

  it('版本页使用真实任务 fork 关系，不再暴露单章文本分支编辑器', () => {
    const operations = read('src/features/studio/agent/components/AgentOperationsCenter.tsx')
    expect(operations).toContain('任务分支')
    expect(operations).toContain('forkAgentSession(sessionId)')
    expect(operations).not.toContain('小说版本分支')
    expect(operations).not.toContain('createStoryBranchRequest')
  })

  it('子 Agent 创建与编辑统一使用自定义弹窗，列表按专业分类', () => {
    const manager = read('src/features/studio/agent/components/SubAgentManager.tsx')
    expect(manager).toContain('aria-label={state.mode === \'create\' ? \'新建子 Agent\' : \'编辑子 Agent\'}')
    expect(manager).toContain('roleGroups.map')
    expect(manager).not.toContain('window.confirm')
  })
})
