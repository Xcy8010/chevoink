import { afterEach, describe, expect, it } from 'vitest'

import { env } from '../../api/config/env.js'
import { getAgentDefinition, getToolsForAgent } from '../../api/lib/agent/agents.js'
import { resolveAgent2FeatureFlags } from '../../api/lib/agent2-feature-flags.js'

const original = {
  rollout: [...env.agent2RolloutUserIds],
  volume: env.featureVolumeEnabled,
  changeSet: env.featureChangeSetEnabled,
  memory2: env.featureMemory2Enabled,
  skill2: env.featureSkill2Enabled,
  storyCompiler: env.featureStoryCompilerEnabled,
  humanityQuality: env.featureHumanityQualityEnabled,
  craftLibrary: env.featureCraftLibraryEnabled,
  dualWorkspace: env.featureDualWorkspaceEnabled,
}

afterEach(() => {
  env.agent2RolloutUserIds = [...original.rollout]
  env.featureVolumeEnabled = original.volume
  env.featureChangeSetEnabled = original.changeSet
  env.featureMemory2Enabled = original.memory2
  env.featureSkill2Enabled = original.skill2
  env.featureStoryCompilerEnabled = original.storyCompiler
  env.featureHumanityQualityEnabled = original.humanityQuality
  env.featureCraftLibraryEnabled = original.craftLibrary
  env.featureDualWorkspaceEnabled = original.dualWorkspace
})

describe('Agent 2.0 灰度与独立功能开关', () => {
  it('空灰度名单默认全量，单项开关互不影响', () => {
    env.agent2RolloutUserIds = []
    env.featureMemory2Enabled = false
    const flags = resolveAgent2FeatureFlags('author-1')
    expect(flags).toMatchObject({
      variant: 'v2', volume: true, changeSet: true, memory2: false, skill2: true, storyCompiler: true, humanityQuality: true, craftLibrary: true, dualWorkspace: true,
    })
  })

  it('非名单用户回退到 v1-compatible，名单用户进入 v2', () => {
    env.agent2RolloutUserIds = ['pilot-author']
    expect(resolveAgent2FeatureFlags('other-author').variant).toBe('v1-compatible')
    expect(resolveAgent2FeatureFlags('other-author').volume).toBe(false)
    expect(resolveAgent2FeatureFlags('pilot-author').variant).toBe('v2')
    expect(resolveAgent2FeatureFlags('pilot-author').volume).toBe(true)
  })

  it('关闭开关时对应工具不会暴露给模型', () => {
    const tools = getToolsForAgent(getAgentDefinition('orchestrator'), 'build', {
      variant: 'v2', volume: false, changeSet: false, memory2: false, skill2: false, storyCompiler: false, humanityQuality: false, craftLibrary: false, dualWorkspace: true,
    })
    const names = new Set(tools.map((tool) => tool.name))
    expect(names.has('volume_create')).toBe(false)
    expect(names.has('changeset_apply')).toBe(false)
    expect(names.has('memory_relation_save')).toBe(false)
    expect(names.has('creative_critique')).toBe(false)
    expect(names.has('story_compiler_prepare')).toBe(false)
    expect(names.has('chapter_bridge_commit')).toBe(false)
    expect(names.has('quality_analyze')).toBe(false)
    expect(names.has('craft_search')).toBe(false)
    expect(names.has('chapter_write')).toBe(true)
  })
})
