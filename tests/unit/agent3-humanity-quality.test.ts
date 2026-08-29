import { describe, expect, it } from 'vitest'

import {
  humanityQualitySignalSchema,
  qualityFindingDispositionSchema,
  qualityFindingFeedbackSchema,
} from '../../shared/contracts/index.js'
import { analyzeDeterministicQuality, calibrateCriticFindings } from '../../api/lib/agent/humanity-quality.js'
import { allTools } from '../../api/lib/agent/tools/registry.js'
import { AGENT_TOOL_GOVERNANCE } from '../../api/lib/agent/tools/governance.js'

describe('Agent 3.0 人类感质量契约与确定性检查', () => {
  it('冻结十三类信号并把作者反馈与修订生命周期分离', () => {
    expect(humanityQualitySignalSchema.options).toHaveLength(13)
    expect(humanityQualitySignalSchema.options).toContain('punctuation_misuse')
    expect(qualityFindingDispositionSchema.parse('repaired')).toBe('repaired')
    expect(() => qualityFindingDispositionSchema.parse('accepted')).toThrow()
    expect(qualityFindingFeedbackSchema.parse('accepted')).toBe('accepted')
  })

  it('把包裹叙述过程的直角引号识别为符号误用，但不误伤人物短对白', () => {
    const source = '「别动。」\n他翻开记录本，看见上面写着「军卡进山那段（牛斗里人挤着人，一路穿过哨卡，最后拐进一扇铁门）」。'
    const findings = analyzeDeterministicQuality(source).findings.filter((finding) => finding.signal === 'punctuation_misuse')
    expect(findings).toHaveLength(1)
    expect(findings[0].evidence).toContain('军卡进山那段')
  })

  it('不会仅因科幻术语、一次华丽句、口语断句或无悬念收束误报', () => {
    const source = '量子干涉仪的读数停在零点。老周啧了一声：“坏了呗。”窗外青山如浅釉，雨只落了一阵。她关灯，回家。'
    const result = analyzeDeterministicQuality(source)
    expect(result.findings).toEqual([])
  })

  it('为重复解释、连续同构和近期重复意象返回精确短证据', () => {
    const source = [
      '他把门锁上，不让任何人进来。他把门锁上，不让任何人进来。',
      '他看见门开了，脚边滚来一枚硬币。',
      '他看见灯灭了，走廊一下沉进黑暗。',
      '他看见电梯停了，数字卡在十三层。',
      '风像一把生锈的锯子。风像一把生锈的锯子。',
    ].join('\n')
    const result = analyzeDeterministicQuality(source)
    const signals = new Set(result.findings.map((finding) => finding.signal))
    expect(signals.has('explanation_echo')).toBe(true)
    expect(signals.has('sentence_homology')).toBe(true)
    expect(signals.has('image_repetition')).toBe(true)
    expect(result.findings.every((finding) => finding.end - finding.start <= 360 && source.slice(finding.start, finding.end) === finding.evidence)).toBe(true)
  })

  it('只向主 Agent 暴露单次自动质量门，旧选择/修订工具保留治理但不再暴露', () => {
    const names = new Set(allTools.map((tool) => tool.name))
    for (const name of ['quality_analyze', 'quality_report_get', 'quality_finding_feedback', 'character_voice_get', 'character_voice_save', 'experience_anchor_get', 'experience_anchor_save']) {
      expect(names.has(name), `${name} 未注册`).toBe(true)
      expect(name in AGENT_TOOL_GOVERNANCE, `${name} 未登记治理`).toBe(true)
    }
    expect(names.has('quality_findings_select')).toBe(false)
    expect(names.has('quality_revision_apply')).toBe(false)
    expect('quality_findings_select' in AGENT_TOOL_GOVERNANCE).toBe(false)
    expect('quality_revision_apply' in AGENT_TOOL_GOVERNANCE).toBe(false)
    expect(allTools.find((tool) => tool.name === 'quality_report_get')?.readOnly).toBe(true)
  })

  it('同作品反馈至少三次后只校准 Critic 置信度，不抹掉正文证据', () => {
    const finding = { signal: 'style_drift' as const, severity: 'warning' as const, quote: '原文证据', explanation: '说明', suggestion: '局部修订', confidence: 0.8 }
    const rejected = calibrateCriticFindings([finding], [{ signal: 'style_drift', authorFeedback: 'rejected', _count: { _all: 3 } }])
    expect(rejected[0]).toMatchObject({ quote: '原文证据', confidence: 0.55 })
    const sparse = calibrateCriticFindings([finding], [{ signal: 'style_drift', authorFeedback: 'accepted', _count: { _all: 2 } }])
    expect(sparse[0].confidence).toBe(0.8)
  })
})
