export type AgentEvalObservation = {
  scenarioId: string
  passed: boolean
  promptTokens: number
  completionTokens: number
  durationMs: number
  rollbackAttempted: boolean
  rollbackSucceeded: boolean | null
}

export type AgentEvalSummary = {
  sampleCount: number
  taskSuccessRate: number
  averageTotalTokens: number
  p95DurationMs: number
  rollbackSuccessRate: number | null
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000
}

/** 汇总口径固定，避免 1.0/2.0 对照时临时更换成功率、token 或回滚算法。 */
export function summarizeAgentEval(observations: AgentEvalObservation[]): AgentEvalSummary {
  if (observations.length === 0) {
    return {
      sampleCount: 0,
      taskSuccessRate: 0,
      averageTotalTokens: 0,
      p95DurationMs: 0,
      rollbackSuccessRate: null,
    }
  }

  const durations = observations.map((item) => item.durationMs).sort((left, right) => left - right)
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1)
  const rollbackSamples = observations.filter((item) => item.rollbackAttempted)

  return {
    sampleCount: observations.length,
    taskSuccessRate: round(observations.filter((item) => item.passed).length / observations.length),
    averageTotalTokens: round(
      observations.reduce((total, item) => total + item.promptTokens + item.completionTokens, 0) /
        observations.length,
    ),
    p95DurationMs: durations[p95Index],
    rollbackSuccessRate:
      rollbackSamples.length === 0
        ? null
        : round(rollbackSamples.filter((item) => item.rollbackSucceeded).length / rollbackSamples.length),
  }
}
