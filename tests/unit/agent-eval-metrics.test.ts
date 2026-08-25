import { describe, expect, it } from 'vitest'

import { AGENT_CORE_EVAL_SCENARIOS } from '../agent-evals/core-scenarios.js'
import { summarizeAgentEval } from '../agent-evals/metrics.js'

describe('Agent 2.0 P0 评测口径', () => {
  it('冻结七类不重复核心场景', () => {
    expect(AGENT_CORE_EVAL_SCENARIOS).toHaveLength(7)
    expect(new Set(AGENT_CORE_EVAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(7)
    expect(new Set(AGENT_CORE_EVAL_SCENARIOS.map((scenario) => scenario.category)).size).toBe(7)
  })

  it('统一计算成功率、平均 token、P95 耗时与回滚成功率', () => {
    const summary = summarizeAgentEval([
      { scenarioId: 'EVAL-001', passed: true, promptTokens: 100, completionTokens: 50, durationMs: 1000, rollbackAttempted: true, rollbackSucceeded: true },
      { scenarioId: 'EVAL-002', passed: false, promptTokens: 200, completionTokens: 50, durationMs: 3000, rollbackAttempted: false, rollbackSucceeded: null },
      { scenarioId: 'EVAL-003', passed: true, promptTokens: 300, completionTokens: 100, durationMs: 2000, rollbackAttempted: true, rollbackSucceeded: false },
    ])

    expect(summary).toEqual({
      sampleCount: 3,
      taskSuccessRate: 0.6667,
      averageTotalTokens: 266.6667,
      p95DurationMs: 3000,
      rollbackSuccessRate: 0.5,
    })
  })
})
