import { afterEach, describe, expect, it } from 'vitest'

import {
  clearRunBaselines,
  getChapterBaseline,
  getLastTouchedChapter,
  recordChapterBaseline,
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
})
