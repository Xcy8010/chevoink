import { describe, expect, it } from 'vitest'

import { aggregateAgentEvalResults } from '../../api/lib/agent/blind-review.js'

const ratings = Object.fromEntries([
  'continue_reading',
  'plot_progress',
  'character_agency_voice',
  'emotion_credibility',
  'style_consistency',
  'description_function',
  'mechanical_texture',
  'chapter_bridge',
  'overall_preference',
].map((key) => [key, 4]))

describe('Agent 3.0 专家盲评聚合', () => {
  it('按隐藏来源聚合评分、机械感与偏好，不依赖固定盲标签', () => {
    const result = aggregateAgentEvalResults(
      [
        { sampleId: 's1', blindLabel: 'C', origin: 'agent2' },
        { sampleId: 's1', blindLabel: 'A', origin: 'agent3' },
        { sampleId: 's1', blindLabel: 'B', origin: 'human' },
      ],
      [{
        sampleId: 's1',
        reviewerHash: 'reviewer-hash',
        candidateRatings: { A: ratings, B: { ...ratings, overall_preference: 5 }, C: { ...ratings, overall_preference: 2 } },
        mechanicalReasons: { A: [], B: [], C: ['sentence_homology'] },
        preferredLabel: 'B',
      }],
    )

    expect(result.reviewerCount).toBe(1)
    expect(result.variants.find((item) => item.origin === 'human')).toMatchObject({
      reviewCount: 1,
      preferenceRate: 1,
      mechanicalMarkRate: 0,
    })
    expect(result.variants.find((item) => item.origin === 'agent2')).toMatchObject({
      preferenceRate: 0,
      mechanicalMarkRate: 1,
      averageRatings: { overall_preference: 2 },
    })
  })
})
