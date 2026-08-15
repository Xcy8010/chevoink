import type { Prisma } from '@prisma/client'

import { DataAccessError, prisma } from '../prisma.js'

/**
 * 作品维度的「计划文件夹」产物服务（自 run-service.ts 模块级拆分而来，行为原样保留）。
 * 聚合 savedAsPlan 的 chapterPlan 产物，供任务窗口体系的计划树消费。
 */

export type NovelPlanArtifact = {
  id: string
  runId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function toNovelPlanArtifact(artifact: {
  id: string
  runId: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}): NovelPlanArtifact {
  return {
    id: artifact.id,
    runId: artifact.runId,
    title: artifact.title,
    content: artifact.content,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  }
}

/** 作品维度拉取“计划文件夹”内容：跨会话/跨任务窗口聚合 savedAsPlan 的产物 */
export async function listNovelPlanArtifacts(
  userId: string,
  novelId: string,
): Promise<{ items: NovelPlanArtifact[] }> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: { id: true },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOT_FOUND', '作品不存在或无权访问。')
  }

  const artifacts = await prisma.agentArtifact.findMany({
    where: {
      artifactType: 'chapterPlan',
      metadata: { path: ['savedAsPlan'], equals: true },
      run: { userId, novelId },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, runId: true, title: true, content: true, createdAt: true, updatedAt: true },
  })

  // 同名去重（plan/14 §四 B3）：历史重复落盘的同名计划只保留最后更新的一份，无需数据迁移
  const latestByTitle = new Map<string, (typeof artifacts)[number]>()
  for (const artifact of artifacts) {
    const kept = latestByTitle.get(artifact.title)
    if (!kept || artifact.updatedAt >= kept.updatedAt) {
      latestByTitle.set(artifact.title, artifact)
    }
  }
  const deduped = artifacts.filter((artifact) => latestByTitle.get(artifact.title)?.id === artifact.id)

  return { items: deduped.map(toNovelPlanArtifact) }
}

/** 手工新建计划：作者在作品树点「新建计划」时落一份空白计划，挂到该作品最近的 Agent 任务上 */
export async function createNovelPlanArtifact(
  userId: string,
  novelId: string,
  title?: string,
): Promise<{ item: NovelPlanArtifact }> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: { id: true, title: true },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOT_FOUND', '作品不存在或无权访问。')
  }

  // 计划产物必须挂在 AgentRun 上：优先复用该作品最近一次任务，还没跑过任务时补一条载体
  let run = await prisma.agentRun.findFirst({
    where: { userId, novelId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  if (!run) {
    const session = await prisma.agentSession.create({
      data: {
        userId,
        novelId,
        // 标题保留默认命名且不写 lastRunAt，这条载体不会出现在任务会话列表里
        title: `${novel.title} 写作会话`,
        status: 'active',
      },
      select: { id: true },
    })

    run = await prisma.agentRun.create({
      data: {
        sessionId: session.id,
        userId,
        novelId,
        mode: 'plan',
        action: 'planChapter',
        agentType: 'storyPlanner',
        status: 'completed',
        inputSummary: '作者手工新建计划',
        finishedAt: new Date(),
      },
      select: { id: true },
    })
  }

  // listNovelPlanArtifacts 会按标题折叠同名计划，这里自动排号，避免新建的空白计划与旧计划互相吞掉
  const existing = await prisma.agentArtifact.findMany({
    where: {
      artifactType: 'chapterPlan',
      metadata: { path: ['savedAsPlan'], equals: true },
      run: { userId, novelId },
    },
    select: { title: true },
  })
  const usedTitles = new Set(existing.map((artifact) => artifact.title.trim()))

  const baseTitle = title?.trim().slice(0, 60) || '未命名计划'
  let nextTitle = baseTitle
  let suffix = 2
  while (usedTitles.has(nextTitle)) {
    nextTitle = `${baseTitle} ${suffix}`
    suffix += 1
  }

  const artifact = await prisma.agentArtifact.create({
    data: {
      runId: run.id,
      artifactType: 'chapterPlan',
      title: nextTitle,
      content: '',
      metadata: { savedAsPlan: true, manualCreated: true },
    },
    select: { id: true, runId: true, title: true, content: true, createdAt: true, updatedAt: true },
  })

  return { item: toNovelPlanArtifact(artifact) }
}

/** 更新计划：改名/改正文，或 saved=false 从计划文件夹移除（保留产物本体与任务历史） */
export async function updateNovelPlanArtifact(
  userId: string,
  artifactId: string,
  patch: { title?: string; content?: string; saved?: boolean },
): Promise<{ item: NovelPlanArtifact }> {
  const artifact = await prisma.agentArtifact.findFirst({
    where: { id: artifactId, artifactType: 'chapterPlan', run: { userId } },
  })

  if (!artifact) {
    throw new DataAccessError(404, 'NOT_FOUND', '计划不存在或无权访问。')
  }

  const metadata =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? { ...(artifact.metadata as Record<string, unknown>) }
      : {}

  if (typeof patch.saved === 'boolean') {
    metadata.savedAsPlan = patch.saved
  }

  const updated = await prisma.agentArtifact.update({
    where: { id: artifact.id },
    data: {
      ...(typeof patch.title === 'string' ? { title: patch.title.slice(0, 160) || '未命名计划' } : {}),
      ...(typeof patch.content === 'string' ? { content: patch.content } : {}),
      metadata: metadata as Prisma.InputJsonValue,
    },
    select: { id: true, runId: true, title: true, content: true, createdAt: true, updatedAt: true },
  })

  return { item: toNovelPlanArtifact(updated) }
}
