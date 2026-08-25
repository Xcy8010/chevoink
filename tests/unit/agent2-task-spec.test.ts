import { describe, expect, it } from 'vitest'

import { buildTaskSpec, extractDirectiveCandidates } from '../../api/lib/agent/task-spec.js'

describe('Agent 2.0 P3 TaskSpec', () => {
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
})
