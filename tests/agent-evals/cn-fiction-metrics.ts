import { createHash } from 'node:crypto'

import { routeSkills } from '../../api/lib/agent/skills/index.js'
import type { CnFictionEvalScenario, CnFictionGenre, CnFictionTask, CnQualitySignal } from './cn-fiction-scenarios.js'

export type SkillRoutingScenarioResult = {
  scenarioId: string
  selectedSkillIds: string[]
  missingExpected: string[]
  selectedForbidden: string[]
  passed: boolean
  fingerprint: string
}

export type SkillRoutingEvalSummary = {
  scenarioCount: number
  exactScenarioPassRate: number
  necessarySkillLoadRate: number
  irrelevantTriggerRate: number
  deterministicReplayRate: number
  byGenre: Record<CnFictionGenre, { count: number; passRate: number }>
  byTask: Partial<Record<CnFictionTask, { count: number; passRate: number }>>
  failures: SkillRoutingScenarioResult[]
}

export type BlindReviewDimension =
  | 'continue_reading'
  | 'plot_progress'
  | 'character_agency_voice'
  | 'emotion_credibility'
  | 'style_consistency'
  | 'description_function'
  | 'mechanical_texture'
  | 'chapter_bridge'
  | 'overall_preference'

export type BlindReviewRecord = {
  datasetVersion: string
  sampleId: string
  reviewerHash: string
  variant: 'agent2' | 'agent3' | 'human'
  dimensions: Record<BlindReviewDimension, 1 | 2 | 3 | 4 | 5>
  guessedOrigin: 'human' | 'ai' | 'unsure'
  mechanicalReasons: CnQualitySignal[]
  submittedAt: string
}

export type BlindReviewSummary = {
  sampleCount: number
  reviewerCount: number
  variantScores: Record<string, Partial<Record<BlindReviewDimension, number>>>
  mechanicalMarkRate: Record<string, number>
}

const round = (value: number) => Math.round(value * 10_000) / 10_000

function runScenario(scenario: CnFictionEvalScenario): SkillRoutingScenarioResult {
  const decision = routeSkills({
    mode: scenario.mode,
    prompt: scenario.prompt,
    intent: scenario.intent,
    phase: scenario.phase,
    freedom: 'balanced',
  })
  const selectedSkillIds = decision.selected.map((skill) => skill.id)
  const missingExpected = scenario.expectedSkillIds.filter((id) => !selectedSkillIds.includes(id))
  const selectedForbidden = scenario.forbiddenSkillIds.filter((id) => selectedSkillIds.includes(id))
  return {
    scenarioId: scenario.id,
    selectedSkillIds,
    missingExpected,
    selectedForbidden,
    passed: missingExpected.length === 0 && selectedForbidden.length === 0,
    fingerprint: createHash('sha256').update(JSON.stringify({ selectedSkillIds, reasonCodes: decision.reasonCodes, phase: decision.phase })).digest('hex'),
  }
}

function groupedPassRate<T extends string>(
  scenarios: CnFictionEvalScenario[],
  resultsById: Map<string, SkillRoutingScenarioResult>,
  keyOf: (scenario: CnFictionEvalScenario) => T,
): Partial<Record<T, { count: number; passRate: number }>> {
  const groups = new Map<T, SkillRoutingScenarioResult[]>()
  for (const scenario of scenarios) {
    const result = resultsById.get(scenario.id)
    if (!result) continue
    const key = keyOf(scenario)
    groups.set(key, [...(groups.get(key) ?? []), result])
  }
  return Object.fromEntries([...groups].map(([key, values]) => [key, {
    count: values.length,
    passRate: round(values.filter((value) => value.passed).length / values.length),
  }])) as Partial<Record<T, { count: number; passRate: number }>>
}

export function evaluateSkillRouting(scenarios: CnFictionEvalScenario[]): SkillRoutingEvalSummary {
  const firstPass = scenarios.map(runScenario)
  const replay = scenarios.map(runScenario)
  const resultsById = new Map(firstPass.map((result) => [result.scenarioId, result]))
  const expectedCount = scenarios.reduce((total, scenario) => total + scenario.expectedSkillIds.length, 0)
  const loadedExpectedCount = firstPass.reduce((total, result) => total + (resultsById.has(result.scenarioId)
    ? (scenarios.find((scenario) => scenario.id === result.scenarioId)?.expectedSkillIds.length ?? 0) - result.missingExpected.length
    : 0), 0)
  const genreGroups = groupedPassRate(scenarios, resultsById, (scenario) => scenario.genre)
  return {
    scenarioCount: scenarios.length,
    exactScenarioPassRate: round(firstPass.filter((result) => result.passed).length / Math.max(1, scenarios.length)),
    necessarySkillLoadRate: expectedCount === 0 ? 1 : round(loadedExpectedCount / expectedCount),
    irrelevantTriggerRate: round(firstPass.filter((result) => result.selectedForbidden.length > 0).length / Math.max(1, scenarios.length)),
    deterministicReplayRate: round(firstPass.filter((result, index) => result.fingerprint === replay[index]?.fingerprint).length / Math.max(1, scenarios.length)),
    byGenre: genreGroups as SkillRoutingEvalSummary['byGenre'],
    byTask: groupedPassRate(scenarios, resultsById, (scenario) => scenario.task),
    failures: firstPass.filter((result) => !result.passed),
  }
}

export function summarizeBlindReviews(records: BlindReviewRecord[]): BlindReviewSummary {
  const variants = [...new Set(records.map((record) => record.variant))]
  const dimensions = records[0] ? Object.keys(records[0].dimensions) as BlindReviewDimension[] : []
  const variantScores = Object.fromEntries(variants.map((variant) => {
    const variantRecords = records.filter((record) => record.variant === variant)
    return [variant, Object.fromEntries(dimensions.map((dimension) => [dimension, round(
      variantRecords.reduce((total, record) => total + record.dimensions[dimension], 0) / Math.max(1, variantRecords.length),
    )]))]
  }))
  const mechanicalMarkRate = Object.fromEntries(variants.map((variant) => {
    const variantRecords = records.filter((record) => record.variant === variant)
    return [variant, round(variantRecords.filter((record) => record.mechanicalReasons.length > 0).length / Math.max(1, variantRecords.length))]
  }))
  return {
    sampleCount: new Set(records.map((record) => record.sampleId)).size,
    reviewerCount: new Set(records.map((record) => record.reviewerHash)).size,
    variantScores,
    mechanicalMarkRate,
  }
}
