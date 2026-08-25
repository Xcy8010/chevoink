import { describe, expect, it } from 'vitest'

import { buildSkillManifestDigest, loadSkill, routeSkills, skillCatalog } from '../../api/lib/agent/skills/index.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'

describe('Agent 2.0 P5 Skill Router', () => {
  it('按意图与阶段组合 0-3 个软 Skill，不注入固定写作检查表', () => {
    const selected = routeSkills({
      mode: 'build', intent: 'write', phase: 'draft', freedom: 'balanced',
      prompt: '续写下一章，重点是林舟和母亲在雨夜的对话与关系变化。',
    })
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.length).toBeLessThanOrEqual(3)
    expect(selected.every((item) => item.strength === 'soft')).toBe(true)
    const digest = buildSkillManifestDigest(selected, 'balanced')
    expect(digest).toContain('可不用')
    expect(digest).not.toContain('必须设置结尾钩子')
  })

  it('Draft、Critique、Revision 资源严格分阶段加载', () => {
    expect(loadSkill('prose-specificity.v2', 'draft', 'balanced')).toBeNull()
    expect(loadSkill('prose-specificity.v2', 'critique', 'balanced')).toContain('标出真实出现')
    expect(loadSkill('prose-specificity.v2', 'revision', 'balanced')).toContain('只改作者选中的')
  })

  it('三档自由度进入 TaskSpec，但不改变事实约束', () => {
    const spec = buildTaskSpec({
      runId: 'run-bold', novelId: 'novel-bold', chapterId: null, creativeFreedom: 'bold',
      prompt: '大胆探索下一章，但必须保持林舟不会读心。',
    })
    expect(spec.creativeFreedom).toBe('bold')
    expect(spec.hardConstraints[0].text).toContain('必须保持')
    expect(loadSkill('scene-craft.v2', 'draft', 'bold')).toContain('事实约束不因此放宽')
  })

  it('外部方法论转化项带许可证与来源说明', () => {
    const adapted = skillCatalog.filter((item) => item.license === 'MIT-adapted')
    expect(adapted.length).toBeGreaterThanOrEqual(3)
    expect(adapted.every((item) => item.attribution?.length)).toBe(true)
  })
})
