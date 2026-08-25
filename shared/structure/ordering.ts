export type StructureVolumeInput = {
  id: string
  chapterIds: string[]
}

export type StructureOrderRow = {
  chapterId: string
  volumeId: string
  orderInVolume: number
  orderIndex: number
}

/** 卷顺序 + 各卷章节数组是结构真源；两个数字序号只由此函数派生。 */
export function buildStructureOrderRows(volumes: StructureVolumeInput[]): StructureOrderRow[] {
  const seen = new Set<string>()
  const rows: StructureOrderRow[] = []
  let orderIndex = 1

  for (const volume of volumes) {
    for (let index = 0; index < volume.chapterIds.length; index += 1) {
      const chapterId = volume.chapterIds[index]
      if (seen.has(chapterId)) {
        throw new Error(`duplicate chapter in structure layout: ${chapterId}`)
      }
      seen.add(chapterId)
      rows.push({ chapterId, volumeId: volume.id, orderInVolume: index + 1, orderIndex })
      orderIndex += 1
    }
  }

  return rows
}
