import { describe, expect, it } from 'vitest'

import { CN_FICTION_EVAL_SCENARIOS, CN_FICTION_EVAL_VERSION } from '../agent-evals/cn-fiction-scenarios.js'
import { evaluateSkillRouting, summarizeBlindReviews, type BlindReviewRecord } from '../agent-evals/cn-fiction-metrics.js'
import { evaluateFiftyChapterBridge } from '../agent-evals/chapter-bridge-metrics.js'

describe('Chevoink-CN-Fiction-Eval v1', () => {
  it('冻结六题材、九任务、十二质量信号与专门难例', () => {
    expect(CN_FICTION_EVAL_SCENARIOS).toHaveLength(24)
    expect(new Set(CN_FICTION_EVAL_SCENARIOS.map((scenario) => scenario.id)).size).toBe(24)
    expect(new Set(CN_FICTION_EVAL_SCENARIOS.map((scenario) => scenario.genre)).size).toBe(6)
    expect(new Set(CN_FICTION_EVAL_SCENARIOS.map((scenario) => scenario.task)).size).toBe(9)
    expect(new Set(CN_FICTION_EVAL_SCENARIOS.flatMap((scenario) => scenario.qualitySignals)).size).toBe(12)
    expect(CN_FICTION_EVAL_SCENARIOS.filter((scenario) => scenario.hardNegative).length).toBeGreaterThanOrEqual(5)
    expect(CN_FICTION_EVAL_SCENARIOS.every((scenario) => scenario.datasetVersion === CN_FICTION_EVAL_VERSION)).toBe(true)
  })

  it('路由基线可重复，并达到 P1 必要技能加载和误触发门槛', () => {
    const summary = evaluateSkillRouting(CN_FICTION_EVAL_SCENARIOS)
    expect(summary.deterministicReplayRate).toBe(1)
    expect(summary.necessarySkillLoadRate).toBeGreaterThanOrEqual(0.95)
    expect(summary.irrelevantTriggerRate).toBeLessThan(0.05)
    expect(summary.failures).toEqual([])
  })

  it('盲评汇总只保存脱敏 reviewer hash，并按版本分别计算机械感标记率', () => {
    const base = {
      datasetVersion: CN_FICTION_EVAL_VERSION,
      sampleId: 'sample-001',
      reviewerHash: 'sha256:reviewer-a',
      dimensions: {
        continue_reading: 4, plot_progress: 4, character_agency_voice: 3, emotion_credibility: 3,
        style_consistency: 4, description_function: 4, mechanical_texture: 3, chapter_bridge: 4, overall_preference: 4,
      },
      guessedOrigin: 'unsure', submittedAt: '2026-08-29T00:00:00.000Z',
    } satisfies Omit<BlindReviewRecord, 'variant' | 'mechanicalReasons'>
    const summary = summarizeBlindReviews([
      { ...base, variant: 'agent2', mechanicalReasons: ['sentence_homology'] },
      { ...base, variant: 'agent3', mechanicalReasons: [] },
    ])
    expect(summary).toMatchObject({ sampleCount: 1, reviewerCount: 1 })
    expect(summary.mechanicalMarkRate).toEqual({ agent2: 1, agent3: 0 })
    expect(summary.variantScores.agent3?.overall_preference).toBe(4)
  })

  it('50 章结构状态桥相对摘要投影的连续性遗漏下降至少 50%', () => {
    const result = evaluateFiftyChapterBridge()
    expect(result).toMatchObject({ chapters: 50, transitions: 49, dimensionsPerTransition: 9 })
    expect(result.agent2Errors).toBeGreaterThan(0)
    expect(result.relativeErrorReduction).toBeGreaterThanOrEqual(0.5)
  })
})
