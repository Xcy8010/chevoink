import { afterEach, describe, expect, it } from 'vitest'

import {
  clearRunBaselines,
  getChapterBaseline,
  getCreatedChapter,
  getLastTouchedChapter,
  recordChapterBaseline,
  recordCreatedChapter,
} from '../../api/lib/agent/baseline.js'

const runIds = ['run-a', 'run-b']

afterEach(() => {
  runIds.forEach(clearRunBaselines)
})

describe('Agent 章节 revision 基线', () => {
  it('按 run 和章节隔离版本，并跟踪最近触达章节', () => {
    recordChapterBaseline('run-a', 'chapter-1', 2)
    recordChapterBaseline('run-a', 'chapter-2', 5)
    recordChapterBaseline('run-b', 'chapter-1', 9)

    expect(getChapterBaseline('run-a', 'chapter-1')).toBe(2)
    expect(getChapterBaseline('run-b', 'chapter-1')).toBe(9)
    expect(getLastTouchedChapter('run-a')).toBe('chapter-2')
  })

  it('清理 run 后同时移除基线与最近章节', () => {
    recordChapterBaseline('run-a', 'chapter-1', 3)
    clearRunBaselines('run-a')

    expect(getChapterBaseline('run-a', 'chapter-1')).toBeNull()
    expect(getLastTouchedChapter('run-a')).toBeNull()
  })

  it('记录本轮已创建章节并按规范化标题拦截重复创建', () => {
    recordCreatedChapter('run-a', ' 第八章 霜甲 ', 'chapter-8')
    expect(getCreatedChapter('run-a', '第八章霜甲')).toBe('chapter-8')
    clearRunBaselines('run-a')
    expect(getCreatedChapter('run-a', '第八章霜甲')).toBeNull()
  })
})
