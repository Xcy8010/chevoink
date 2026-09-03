import { describe, expect, it } from 'vitest'

import { buildCustomSkillArtifacts, customSkillToRuntime } from '../../api/lib/agent/skills/custom.js'
import { buildSkillExecutionDigest, routeSkills, skillCatalog, type AgentSkill } from '../../api/lib/agent/skills/index.js'
import type { AgentSkillDraftInput } from '../../shared/contracts/index.js'

const authorDraft: AgentSkillDraftInput = {
  name: '林渡短句声口',
  description: '写林渡面对压力时的短句和回避方式。',
  intents: ['write'],
  modes: ['build'],
  phases: ['draft'],
  triggerPhrases: ['写林渡', '林渡对话'],
  negativeTriggerPhrases: ['只改错别字'],
  instructions: { draft: '林渡承压时先回避关键名词，用短句回答；不要把短句写成冷漠。' },
  tokenBudget: 360,
  priority: 80,
}

function buildAuthorSkill(id: string, source: 'user' | 'third_party'): AgentSkill {
  const provenance = source === 'third_party'
    ? { license: 'CC-BY-4.0', attribution: '来源：公开写作方法合集', sourcePackage: 'pack-webfiction-voice@1.0.0' }
    : undefined
  const artifacts = buildCustomSkillArtifacts(authorDraft, '0.1.0', source, provenance)
  const runtime = customSkillToRuntime({
    id,
    name: authorDraft.name,
    description: authorDraft.description,
    source,
    license: artifacts.manifest.license,
    version: '0.1.0',
    manifest: artifacts.manifest,
    instructions: artifacts.instructions,
  })
  expect(runtime).not.toBeNull()
  return runtime!
}

describe('技能手动指定与作者技能可见性', () => {
  it('作者手动指定的技能绕过非创作早退与评分门槛，并在指引里标注来自作者', () => {
    const decision = routeSkills({
      mode: 'build', intent: 'revise', freedom: 'stable',
      prompt: '只改一个错别字，不要动其他内容。',
      pinnedSkillIds: new Set(['cn-prose-specificity.v3']),
    })
    expect(decision.skippedReason).toBeUndefined()
    expect(decision.selected.map((skill) => skill.id)).toEqual(['cn-prose-specificity.v3'])
    expect(decision.reasonCodes).toContain('MANUAL_PIN')

    const digest = buildSkillExecutionDigest(decision, 'stable', { pinnedSkillIds: ['cn-prose-specificity.v3'] })
    expect(digest).toContain('作者本轮手动指定')
  })

  it('手动指定的作者技能即使阶段不匹配也按其自有阶段装载', () => {
    const runtime = buildAuthorSkill('custom.pinned', 'user')
    const decision = routeSkills({
      mode: 'build', intent: 'revise', phase: 'revision', freedom: 'balanced',
      prompt: '这一段帮我顺一下。', catalog: [runtime],
      pinnedSkillIds: new Set(['custom.pinned']),
    })
    expect(decision.selected.map((skill) => skill.id)).toEqual(['custom.pinned'])

    const digest = buildSkillExecutionDigest(decision, 'balanced', { pinnedSkillIds: ['custom.pinned'] })
    expect(digest).toContain('本轮阶段 revision 未提供专用说明')
    expect(digest).toContain('林渡承压时先回避关键名词')
  })

  it('未命中触发短语的作者技能仍占一个保底槽位，但不挤掉内置基础技法', () => {
    const runtime = buildAuthorSkill('custom.fallback', 'user')
    const decision = routeSkills({
      mode: 'build', intent: 'write', phase: 'draft', freedom: 'balanced',
      prompt: '续写下一章，推进雨夜追车的紧张感。',
      catalog: [...skillCatalog, runtime],
    })
    const ids = decision.selected.map((skill) => skill.id)
    expect(ids).toContain('custom.fallback')
    expect(ids).toContain('cn-webfiction-draft.v3')
  })

  it('未加载技能清单只在传入已启用目录时公开，并给出来源与适用场景', () => {
    const imported = buildAuthorSkill('custom.imported', 'third_party')
    const decision = routeSkills({
      mode: 'build', intent: 'write', phase: 'draft', freedom: 'balanced',
      prompt: '续写下一章，写林舟和母亲在雨夜的对话与关系变化。',
    })

    expect(buildSkillExecutionDigest(decision, 'balanced')).not.toContain('本轮未加载')

    const digest = buildSkillExecutionDigest(decision, 'balanced', { availableSkills: [...skillCatalog, imported] })
    expect(digest).toContain('本轮未加载、但当前作品已启用的技能')
    expect(digest).toContain('custom.imported@0.1.0')
    expect(digest).toContain('导入技能')
    expect(digest).toContain('适用：写林渡')
    // 已加载的技能不会在未加载清单里重复出现
    const unloadedBlock = digest.slice(digest.indexOf('本轮未加载'))
    for (const skill of decision.selected) {
      expect(unloadedBlock).not.toContain(`- ${skill.id}@`)
    }
  })
})
