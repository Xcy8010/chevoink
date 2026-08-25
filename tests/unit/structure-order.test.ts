import { describe, expect, it } from 'vitest'

import { buildStructureOrderRows, type StructureVolumeInput } from '../../shared/structure/ordering.js'

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('卷章结构顺序性质', () => {
  it('随机执行 10,000 次插入、移动、删除后无重号、断号或重复归属', () => {
    const random = seededRandom(0x2a17c0de)
    const volumes: StructureVolumeInput[] = [
      { id: 'v1', chapterIds: [] },
      { id: 'v2', chapterIds: [] },
      { id: 'v3', chapterIds: [] },
    ]
    let nextChapter = 1

    for (let operation = 0; operation < 10_000; operation += 1) {
      const rowsBefore = buildStructureOrderRows(volumes)
      const action = rowsBefore.length === 0 ? 0 : Math.floor(random() * 3)
      if (action === 0) {
        const target = volumes[Math.floor(random() * volumes.length)]
        const position = Math.floor(random() * (target.chapterIds.length + 1))
        target.chapterIds.splice(position, 0, `c${nextChapter}`)
        nextChapter += 1
      } else {
        const sourceRow = rowsBefore[Math.floor(random() * rowsBefore.length)]
        const source = volumes.find((volume) => volume.id === sourceRow.volumeId)!
        source.chapterIds.splice(source.chapterIds.indexOf(sourceRow.chapterId), 1)
        if (action === 1) {
          const target = volumes[Math.floor(random() * volumes.length)]
          const position = Math.floor(random() * (target.chapterIds.length + 1))
          target.chapterIds.splice(position, 0, sourceRow.chapterId)
        }
      }

      const rows = buildStructureOrderRows(volumes)
      expect(rows.map((row) => row.orderIndex)).toEqual(rows.map((_, index) => index + 1))
      expect(new Set(rows.map((row) => row.chapterId)).size).toBe(rows.length)
      for (const volume of volumes) {
        const localRows = rows.filter((row) => row.volumeId === volume.id)
        expect(localRows.map((row) => row.orderInVolume)).toEqual(localRows.map((_, index) => index + 1))
      }
    }
  })

  it('拒绝同一章节重复出现在多个卷', () => {
    expect(() => buildStructureOrderRows([
      { id: 'v1', chapterIds: ['c1'] },
      { id: 'v2', chapterIds: ['c1'] },
    ])).toThrow(/duplicate chapter/)
  })
})
