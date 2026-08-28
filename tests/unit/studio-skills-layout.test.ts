import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Agent 3.0 技能区跨端入口', () => {
  it('Work 与 IDE 共用同一个技能面板且 IDE 折叠态有独立入口', () => {
    const workspace = read('src/features/studio/StudioWorkspace.tsx')
    const inspector = read('src/features/studio/components/WorkInspector.tsx')
    const rail = read('src/features/studio/components/IdeNavigationRail.tsx')
    expect(workspace.match(/<SkillsPanel novelId=\{currentNovel\.id\}/g)?.length).toBeGreaterThanOrEqual(3)
    expect(inspector).toContain("'skills'")
    expect(inspector).toContain("label: '技能'")
    expect(rail).toContain("key: 'skills'")
  })

  it('手机端更多菜单、标题和内容区都能打开作品技能', () => {
    const workspace = read('src/features/studio/StudioWorkspace.tsx')
    const types = read('src/features/studio/types.ts')
    expect(types).toContain("'skills'")
    expect(workspace).toContain("label: '作品技能'")
    expect(workspace).toContain("mobileView === 'skills'")
    expect(workspace).toContain("setMobileView('skills')")
  })
})
