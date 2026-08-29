export type ResearchOperationSample = {
  searchCount: number
  reusedCount: number
  buildDurationMs: number
  estimatedInputTokens: number
}

export function evaluateResearchOperations(samples: ResearchOperationSample[]) {
  const builds = samples.length
  const reuses = samples.reduce((sum, sample) => sum + sample.reusedCount, 0)
  const totalUses = builds + reuses
  const totalSearches = samples.reduce((sum, sample) => sum + sample.searchCount, 0)
  const totalTokens = samples.reduce((sum, sample) => sum + sample.estimatedInputTokens, 0)
  const totalDuration = samples.reduce((sum, sample) => sum + sample.buildDurationMs, 0)
  return {
    builds,
    reuses,
    reuseRate: totalUses === 0 ? 0 : reuses / totalUses,
    averageSearchesPerBuild: builds === 0 ? 0 : totalSearches / builds,
    averageInputTokensPerBuild: builds === 0 ? 0 : totalTokens / builds,
    averageBuildDurationMs: builds === 0 ? 0 : totalDuration / builds,
    withinQueryBudget: samples.every((sample) => sample.searchCount <= 3),
  }
}
