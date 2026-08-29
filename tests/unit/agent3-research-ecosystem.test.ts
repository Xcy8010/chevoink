import { describe, expect, it } from 'vitest'

import { getToolsForAgent, agentRegistry } from '../../api/lib/agent/agents.js'
import { AGENT_TOOL_GOVERNANCE } from '../../api/lib/agent/tools/governance.js'
import { getToolByName } from '../../api/lib/agent/tools/registry.js'
import { evaluateResearchOperations } from '../agent-evals/research-flywheel-metrics.js'

describe('Agent 3.0 研究台与反馈生态门禁', () => {
  it('研究工具明确限制普通续写并登记治理后置条件', () => {
    const build = getToolByName('research_dossier_build')
    const read = getToolByName('research_dossier_get')
    const prototype = getToolByName('first_three_prototype_build')
    expect(build?.description).toContain('普通续写')
    expect(build?.description).toContain('24 小时')
    expect(build?.description).toContain('最多 3 个查询')
    expect(read?.description).toContain('只读本缓存')
    expect(prototype?.description).toContain('恰好三章')
    expect(AGENT_TOOL_GOVERNANCE.research_dossier_build.postconditions).toContain('query_budget_enforced')
    expect(AGENT_TOOL_GOVERNANCE.first_three_prototype_build.postconditions).toContain('no_chapter_content_written')
  })

  it('研究台可独立关闭且不影响 Story Compiler', () => {
    const tools = getToolsForAgent(agentRegistry[0], 'plan', {
      volume: true, changeSet: true, memory2: true, skill2: true, storyCompiler: true,
      humanityQuality: true, craftLibrary: true, researchDossier: false,
      feedbackFlywheel: true, skillSharing: true, dualWorkspace: true, variant: 'v2',
    })
    const names = tools.map((tool) => tool.name)
    expect(names).not.toContain('research_dossier_build')
    expect(names).not.toContain('first_three_prototype_build')
    expect(names).toContain('story_charter_save')
  })

  it('运营指标区分真实构建与缓存复用并执行三查询预算', () => {
    const result = evaluateResearchOperations([
      { searchCount: 3, reusedCount: 4, buildDurationMs: 1200, estimatedInputTokens: 1800 },
      { searchCount: 2, reusedCount: 2, buildDurationMs: 800, estimatedInputTokens: 1200 },
    ])
    expect(result).toMatchObject({ builds: 2, reuses: 6, reuseRate: 0.75, averageSearchesPerBuild: 2.5, withinQueryBudget: true })
  })
})
