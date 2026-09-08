import { describe, expect, it } from 'vitest'

import { buildTaskSpec, extractDirectiveCandidates, narrowLegacyResearchTask } from '../../api/lib/agent/task-spec.js'

describe('explicit report length requirement', () => {
  it('keeps a report minimum alongside unrelated prohibitions', () => {
    expect(buildTaskSpec({ runId: 'r', novelId: 'n', prompt: '分析这本小说，分析报告至少10000字，不要写章节' })
      .expectedOutputs[0].minimumChineseCharacters).toBe(10000)
  })
  it.each(['分析报告至少10000字', '至少一万字的分析报告', '研究报告字数不少于1万字'])('freezes a clear in-chat minimum: %s', prompt => {
    const spec = buildTaskSpec({ runId: 'run', novelId: 'novel', prompt: `请分析这本书，${prompt}` })
    expect(spec.expectedOutputs[0].minimumChineseCharacters).toBe(10000)
    expect(spec.expectedOutputs[0].description).toContain('不计代码')
  })
  it.each(['分析这本书，不要一万字报告', '分析报告大约10000字', '把至少一万字的分析报告保存到计划', '写第一章至少3000字'])('does not invent a text-report lower bound: %s', prompt => {
    expect(buildTaskSpec({ runId: 'run', novelId: 'novel', prompt }).expectedOutputs[0].minimumChineseCharacters).toBeUndefined()
  })
})

describe('Agent 2.0 P3 TaskSpec', () => {
  it('narrows legacy research on resume without replacing its task identity, scope or original goals', () => {
    const original = buildTaskSpec({ runId: 'r', novelId: 'n', prompt: '搜索并拆解这本小说' })
    const legacy = { ...original, intent: 'write' as const }
    const repaired = narrowLegacyResearchTask(legacy, '搜索并拆解这本小说')
    expect(repaired).toMatchObject({ id: legacy.id, runId: legacy.runId, scope: legacy.scope,
      goals: legacy.goals, intent: 'research_analysis' })
    expect(narrowLegacyResearchTask(legacy, '继续')).toBe(legacy)
    expect(narrowLegacyResearchTask(legacy, '分析后写第一章')).toBe(legacy)
    expect(narrowLegacyResearchTask(repaired, '搜索并拆解这本小说')).toBe(repaired)
  })
  it.each(['搜索并拆解《样本小说》', '调研并阅读这本书', '分析这本小说，不要写章节', 'Research and analyze this novel', '解读本书的人物变化'])('separates research from creation: %s', prompt => {
    expect(buildTaskSpec({ runId: 'r', novelId: 'n', prompt }).intent).toBe('research_analysis')
  })
  it.each(['分析后写第一章', '拆解这本书，然后保存报告到计划', '检查当前章节并修复问题', '续写第十九章'])('does not silently discard an explicit non-research workflow: %s', prompt => {
    expect(buildTaskSpec({ runId: 'r', novelId: 'n', prompt }).intent).not.toBe('research_analysis')
  })
  it('识别全书变更并冻结硬约束与交付后置条件', () => {
    const spec = buildTaskSpec({
      runId: 'run-1', novelId: 'novel-1', chapterId: null,
      prompt: '把全书所有章节的林默统一改名为林舟。必须保留引号中的历史旧名，不要逐章整段覆盖。',
    })
    expect(spec.intent).toBe('global_transform')
    expect(spec.hardConstraints.map((item) => item.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('必须保留'), expect.stringContaining('不要逐章'),
    ]))
    expect(spec.expectedOutputs[0].kind).toBe('changeset')
    expect(spec.postconditions.map((item) => item.code)).toContain('CHANGESET_VERIFIED')
  })

  it('只提取作者显式表达的长期指令，不把普通叙述误收为账本', () => {
    expect(extractDirectiveCandidates('写下一章，主角走进雨巷。')).toEqual([])
    expect(extractDirectiveCandidates('以后必须使用第一人称。希望对话更自然。')).toMatchObject([
      { kind: 'must' }, { kind: 'preference' },
    ])
  })

  it('续写指定卷且保护前文时冻结结构与正文后置条件', () => {
    const spec = buildTaskSpec({
      runId: 'run-volume', novelId: 'novel-1', chapterId: null,
      prompt: '在不改动前面内容的情况下续写完整第二卷。',
    })
    expect(spec.postconditions.map((item) => item.code)).toEqual(expect.arrayContaining([
      'STRUCTURE_VALIDATED',
      'EARLIER_CONTENT_UNCHANGED',
    ]))
  })
})
