/**
 * 话题域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { TopicSummary } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { toTopic } from './internal.js'



export async function listTopicsData(): Promise<{ items: TopicSummary[] }> {
  // postCount 以 PostTopic 关联表实时计数为准：Topic.postCount 是发帖时 increment 的冗余列，
  // 历史删帖/删话题不回写会漂移（话题栏「全部」与各频道数字对不上的根因）
  const items = await prisma.topic.findMany({
    include: { _count: { select: { postLinks: true } } },
    orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
    take: 12,
  })

  return {
    items: items.map((item) => toTopic({ ...item, postCount: item._count.postLinks })),
  }
}



/** 推荐话题（方案 18 §3.4）：trendScore = 近7天帖数*3 + log2(1+总帖数)，取前 3 个 */
export async function listRecommendedTopicsData(): Promise<{ items: TopicSummary[] }> {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [topics, recentLinks] = await Promise.all([
    prisma.topic.findMany({
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: 50,
    }),
    prisma.postTopic.groupBy({
      by: ['topicId'],
      where: { createdAt: { gte: since } },
      _count: { topicId: true },
    }),
  ])

  const recentCountMap = new Map(recentLinks.map((entry) => [entry.topicId, entry._count.topicId]))
  const items = topics
    .map((topic) => ({
      topic,
      score: (recentCountMap.get(topic.id) ?? 0) * 3 + Math.log2(1 + topic.postCount),
    }))
    .sort((a, b) => b.score - a.score || b.topic.postCount - a.topic.postCount)
    .slice(0, 3)
    .map((entry) => toTopic(entry.topic))

  return { items }
}



/** 按 slug/name/id 依次解析话题：话题详情页入口 */
export async function resolveTopicData(key: string): Promise<TopicSummary | null> {
  const topic =
    (await prisma.topic.findUnique({ where: { slug: key } })) ??
    (await prisma.topic.findUnique({ where: { name: key } })) ??
    (await prisma.topic.findUnique({ where: { id: key } }))

  return topic ? toTopic(topic) : null
}
