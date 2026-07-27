// 一次性清理：作品根评论一人多条的历史重复数据（保留最早一条，其余连同回复/点赞删除），
// 并回算作品 commentCount。上线「一人一条」规则前产生的脏数据用这脚本清理。
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const roots = await prisma.comment.findMany({
    where: { targetType: 'novel', parentId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, targetId: true },
  })

  // 同一 (userId, novelId) 只保留最早一条
  const seen = new Set()
  const duplicateIds = []
  for (const comment of roots) {
    const key = `${comment.userId}::${comment.targetId}`
    if (seen.has(key)) {
      duplicateIds.push(comment.id)
    } else {
      seen.add(key)
    }
  }

  if (duplicateIds.length === 0) {
    console.log('没有发现重复的作品根评论。')
    return
  }

  const replies = await prisma.comment.findMany({
    where: { OR: [{ parentId: { in: duplicateIds } }, { rootId: { in: duplicateIds } }] },
    select: { id: true },
  })
  const removeIds = [...new Set([...duplicateIds, ...replies.map((item) => item.id)])]

  const affectedNovelIds = [
    ...new Set(
      roots.filter((comment) => duplicateIds.includes(comment.id)).map((comment) => comment.targetId),
    ),
  ]

  await prisma.$transaction(async (tx) => {
    await tx.commentLike.deleteMany({ where: { commentId: { in: removeIds } } })
    await tx.comment.deleteMany({ where: { id: { in: removeIds } } })

    for (const novelId of affectedNovelIds) {
      const remaining = await tx.comment.count({ where: { targetType: 'novel', targetId: novelId } })
      await tx.novel.updateMany({ where: { id: novelId }, data: { commentCount: remaining } })
    }
  })

  console.log(`已删除重复根评论 ${duplicateIds.length} 条（含回复共 ${removeIds.length} 条），回算了 ${affectedNovelIds.length} 部作品的评论数。`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
