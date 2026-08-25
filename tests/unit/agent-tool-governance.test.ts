import { describe, expect, it } from 'vitest'

import { AGENT_TOOL_GOVERNANCE } from '../../api/lib/agent/tools/governance.js'
import { allTools } from '../../api/lib/agent/tools/registry.js'

describe('Agent 工具治理清单', () => {
  it('注册表内每个工具都有分类、风险和后置条件', () => {
    for (const tool of allTools) {
      const governance = AGENT_TOOL_GOVERNANCE[tool.name as keyof typeof AGENT_TOOL_GOVERNANCE]
      expect(governance, `${tool.name} 未登记治理信息`).toBeDefined()
      expect(governance.postconditions.length, `${tool.name} 未登记后置条件`).toBeGreaterThan(0)
    }
  })

  it('治理清单不存在未注册的幽灵工具', () => {
    const registeredNames = new Set(allTools.map((tool) => tool.name))
    for (const name of Object.keys(AGENT_TOOL_GOVERNANCE)) {
      expect(registeredNames.has(name), `${name} 已登记但未注册`).toBe(true)
    }
  })

  it('dangerous 工具必须归类为高风险', () => {
    for (const tool of allTools.filter((item) => item.dangerous)) {
      expect(AGENT_TOOL_GOVERNANCE[tool.name as keyof typeof AGENT_TOOL_GOVERNANCE].category).toBe('high_risk')
    }
  })

  it('跨文档应用与回滚即使全局自动批准开启也必须逐次确认', () => {
    for (const name of ['changeset_apply', 'changeset_rollback']) {
      const tool = allTools.find((item) => item.name === name)
      expect(tool?.alwaysConfirm).toBe(true)
      expect(tool?.dangerous).toBe(true)
      expect(tool?.permission.build).toBe('ask')
    }
  })
})
