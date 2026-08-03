// 一次性修复：把所有作品的章节编号（orderIndex）压缩为连续的 1..N。
// 历史上删除章节不回收编号，导致章节树显示「第1/第4/第5章」跳号；
// 上线「删除后自动压缩编号」逻辑前产生的存量脏数据用这脚本清理。
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const novels = await prisma.novel.findMany({
    select: { id: true, title: true, displayTitle: true },
  })

  let fixedNovels = 0
  let fixedChapters = 0

  for (const novel of novels) {
    const chapters = await prisma.chapter.findMany({
      where: { novelId: novel.id },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, orderIndex: true },
    })

    const updates = []
    chapters.forEach((chapter, index) => {
      if (chapter.orderIndex !== index + 1) {
        updates.push({ id: chapter.id, orderIndex: index + 1 })
      }
    })

    if (updates.length === 0) {
      continue
    }

    // 升序处理：目标编号恒 ≤ 当前编号且此前已腾空，不会撞 novelId+orderIndex 唯一约束
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.chapter.update({
          where: { id: update.id },
          data: { orderIndex: update.orderIndex },
        })
      }
    })

    fixedNovels += 1
    fixedChapters += updates.length
    console.log(`[compact] 《${novel.displayTitle ?? novel.title}》(${novel.id})：重排 ${updates.length} 章`)
  }

  console.log(`完成：共修复 ${fixedNovels} 部作品、${fixedChapters} 个章节编号。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
