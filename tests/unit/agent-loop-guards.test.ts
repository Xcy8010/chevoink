import { describe, expect, it } from 'vitest'

import {
  CHECKPOINT_BUDGET_SLICE,
  CHECKPOINT_MAX_COMPACTIONS,
  CHECKPOINT_MAX_RESUMES,
  CHECKPOINT_TURN_SLICE,
  evaluateCheckpoint,
  resolveRunTokenBudget,
} from '../../api/lib/agent/checkpoint.js'
import { createRepeatDetector } from '../../api/lib/agent/repeat-detect.js'
import { toolSignature } from '../../api/lib/agent/tool-signature.js'

describe('plan/18 P0：工具调用签名', () => {
  it('同工具同参数：键顺序不同仍同签名', () => {
    expect(toolSignature('chapter_write', '{"chapterId":"c1","content":"正文"}'))
      .toBe(toolSignature('chapter_write', '{"content":"正文","chapterId":"c1"}'))
  })

  it('不同工具或不同参数：签名不同', () => {
    expect(toolSignature('chapter_write', '{"chapterId":"c1"}'))
      .not.toBe(toolSignature('chapter_append', '{"chapterId":"c1"}'))
    expect(toolSignature('chapter_write', '{"chapterId":"c1"}'))
      .not.toBe(toolSignature('chapter_write', '{"chapterId":"c2"}'))
  })

  it('长正文只取前 200 字符：重复再生成（开头相同、长度微变）仍同签名，熔断不被绕过', () => {
    const base = '他抬起头，看见远处的灯塔在雾里明灭。'.repeat(20)
    expect(toolSignature('chapter_write', JSON.stringify({ chapterId: 'c1', content: base })))
      .toBe(toolSignature('chapter_write', JSON.stringify({ chapterId: 'c1', content: `${base}结尾多了一句。` })))
  })

  it('前 200 字符不同：签名不同（正常连续写作不误判）', () => {
    expect(toolSignature('chapter_append', JSON.stringify({ content: `第一段${'甲'.repeat(300)}` })))
      .not.toBe(toolSignature('chapter_append', JSON.stringify({ content: `第二段${'甲'.repeat(300)}` })))
  })

  it('参数不是合法 JSON：按截断原文参与哈希，不抛错', () => {
    expect(toolSignature('chapter_write', '{broken json')).toMatch(/^chapter_write:/)
    expect(toolSignature('chapter_write', null)).toMatch(/^chapter_write:/)
  })
})

describe('plan/18 P1：信道重复检测器', () => {
  const sentence = '这是一段被复读机反复输出的固定文本内容用来触发重复检测器命中。'

  it('同一段 50 字块在窗口内出现 3 次即命中', () => {
    const gram = sentence.padEnd(50, '字').slice(0, 50)
    // 间隔填充非重复内容（恰好 50 字保持 gram 对齐），模拟流式真实形态
    const fillerA = '下一段完全不同的正常叙述内容用来填充窗口'.padEnd(50, '甲').slice(0, 50)
    const fillerB = '又一段全新的正常内容继续推进剧情不重复'.padEnd(50, '乙').slice(0, 50)
    const detector = createRepeatDetector()
    detector.push(gram)
    detector.push(fillerA)
    expect(detector.push(gram)).toBeNull() // 第二次出现还不够
    detector.push(fillerB)
    expect(detector.push(gram)).toBe(gram) // 第三次命中
  })

  it('正常不重复文本不命中', () => {
    const detector = createRepeatDetector()
    let hit: string | null = null
    for (let index = 0; index < 40; index++) {
      hit = detector.push(`第${index}段完全不同的正文内容，讲述剧情推进${'细节'.repeat(20)}`.slice(0, 50))
      if (hit) break
    }
    expect(hit).toBeNull()
  })

  it('空白占比过高的块不参与计数（换行列表不误报）', () => {
    const detector = createRepeatDetector()
    const whitespaceGram = '\n\n\n\n\n\n\n\n\n\n标题\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'
    let hit: string | null = null
    for (let index = 0; index < 6; index++) hit = detector.push(whitespaceGram)
    expect(hit).toBeNull()
  })

  it('同一 gram 只报一次；窗口滑出后计数衰减', () => {
    const detector = createRepeatDetector(200, 50, 3) // 窗口只留 4 个 gram，便于验证滑出
    const gram = sentence.padEnd(50, '字').slice(0, 50)
    detector.push(gram)
    detector.push(gram)
    expect(detector.push(gram)).toBe(gram)
    expect(detector.push(gram)).toBeNull() // 同一 gram 去重，不重复上报
    // 用不重复内容（50 字对齐）把窗口冲干净，再喂 2 次不应命中（旧计数已滑出）
    for (let index = 0; index < 10; index++) detector.push(`全新内容${index}号段落`.padEnd(50, `填${index}`).slice(0, 50))
    detector.push(gram)
    expect(detector.push(gram)).toBeNull()
  })
})

describe('plan/18 P4：检查点评估', () => {
  const baseInput = {
    todoLeft: 3,
    writeProgress: 5,
    writeBaseline: 2,
    resumeCount: 0,
    compactionCount: 0,
    elapsedMs: 30 * 60_000,
    longWallClockLimitMs: 180 * 60_000,
  }

  it('四条件全满足：允许续跑', () => {
    expect(evaluateCheckpoint(baseInput).ok).toBe(true)
  })

  it('条件 a：待办全部完成不续跑', () => {
    expect(evaluateCheckpoint({ ...baseInput, todoLeft: 0 }).ok).toBe(false)
  })

  it('条件 b（compaction 防 loop）：区间无新写类进展不续跑', () => {
    expect(evaluateCheckpoint({ ...baseInput, writeProgress: 2, writeBaseline: 2 }).ok).toBe(false)
  })

  it('条件 c：续跑与压缩次数达上限不续跑', () => {
    expect(evaluateCheckpoint({ ...baseInput, resumeCount: CHECKPOINT_MAX_RESUMES }).ok).toBe(false)
    expect(evaluateCheckpoint({ ...baseInput, compactionCount: CHECKPOINT_MAX_COMPACTIONS }).ok).toBe(false)
  })

  it('条件 d：墙钟长任务总帽已超不续跑', () => {
    expect(evaluateCheckpoint({ ...baseInput, elapsedMs: 181 * 60_000 }).ok).toBe(false)
  })

  it('切片常量：预算片 100 万、轮次片 50', () => {
    expect(CHECKPOINT_BUDGET_SLICE).toBe(1_000_000)
    expect(CHECKPOINT_TURN_SLICE).toBe(50)
  })
})

describe('plan/18：tokenBudget clamp（预算切片化双轨）', () => {
  const DEFAULT_BUDGET = 2_000_000
  const CEILING = 5_000_000

  it('未显式指定：用默认 200 万', () => {
    expect(resolveRunTokenBudget(undefined, DEFAULT_BUDGET, CEILING)).toBe(DEFAULT_BUDGET)
    expect(resolveRunTokenBudget(null, DEFAULT_BUDGET, CEILING)).toBe(DEFAULT_BUDGET)
  })

  it('显式上调：允许，但 clamp 到硬顶 500 万', () => {
    expect(resolveRunTokenBudget(3_500_000, DEFAULT_BUDGET, CEILING)).toBe(3_500_000)
    expect(resolveRunTokenBudget(99_999_999, DEFAULT_BUDGET, CEILING)).toBe(CEILING)
  })

  it('显式下调：允许，最低 500 防空转误杀', () => {
    expect(resolveRunTokenBudget(800_000, DEFAULT_BUDGET, CEILING)).toBe(800_000)
    expect(resolveRunTokenBudget(1, DEFAULT_BUDGET, CEILING)).toBe(500)
  })
})
