import { createHash } from 'node:crypto'

import { PrismaClient } from '@prisma/client'

import { resolveAgent2FeatureFlags } from '../api/lib/agent2-feature-flags.js'
import { processMemoryExtractionJob } from '../api/lib/agent/story-memory.js'
import { normalizeNovelStructure } from '../api/lib/data/volume.js'

const prisma = new PrismaClient()
const command = process.argv[2] ?? 'diagnose'
const apply = process.argv.includes('--apply')
const novelArg = process.argv.find((arg) => arg.startsWith('--novel='))
const novelId = novelArg?.slice('--novel='.length)

function contiguous(values: number[]): boolean {
  return values.every((value, index) => value === index + 1)
}

async function diagnose() {
  const novels = await prisma.novel.findMany({
    where: novelId ? { id: novelId } : undefined,
    select: {
      id: true,
      title: true,
      volumes: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } },
      chapters: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, volumeId: true, orderIndex: true, orderInVolume: true },
      },
    },
  })
  const structures = novels.map((novel) => {
    const invalidVolumes = !contiguous(novel.volumes.map((volume) => volume.orderIndex))
    const invalidGlobalOrder = !contiguous(novel.chapters.map((chapter) => chapter.orderIndex))
    const invalidVolumeOrder = novel.volumes.some((volume) => {
      const chapters = novel.chapters
        .filter((chapter) => chapter.volumeId === volume.id)
        .sort((left, right) => left.orderInVolume - right.orderInVolume)
      return !contiguous(chapters.map((chapter) => chapter.orderInVolume))
    })
    return {
      novelId: novel.id,
      title: novel.title,
      volumeCount: novel.volumes.length,
      chapterCount: novel.chapters.length,
      valid: novel.volumes.length > 0 && !invalidVolumes && !invalidGlobalOrder && !invalidVolumeOrder,
    }
  })
  const [pendingMemoryJobs, failedMemoryJobs, pendingMemoryReviews, openChangeSets] = await Promise.all([
    prisma.memoryExtractionJob.count({ where: { status: { in: ['pending', 'processing'] } } }),
    prisma.memoryExtractionJob.count({ where: { status: 'failed' } }),
    prisma.projectMemoryEntry.count({ where: { reviewStatus: 'pending' } }),
    prisma.changeSet.count({ where: { status: { in: ['draft', 'approved', 'applying', 'conflicted', 'failed'] } } }),
  ])
  return { structures, pendingMemoryJobs, failedMemoryJobs, pendingMemoryReviews, openChangeSets }
}

async function repairStructure() {
  const ids = novelId
    ? [novelId]
    : (await prisma.novel.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })).map((item) => item.id)
  if (!apply) return { dryRun: true, candidates: ids, instruction: '确认备份后追加 --apply 执行。' }
  for (const id of ids) {
    await prisma.$transaction((tx) => normalizeNovelStructure(tx, id))
  }
  return { dryRun: false, repairedNovelIds: ids }
}

const searchIndexes = [
  'chapters_title_trgm_idx',
  'chapters_summary_trgm_idx',
  'chapters_content_trgm_idx',
  'chapters_search_fts_idx',
  'project_memory_entries_search_trgm_idx',
]

async function rebuildIndexes() {
  if (!apply) return { dryRun: true, indexes: searchIndexes, instruction: '低峰期追加 --apply 执行。' }
  for (const index of searchIndexes) {
    await prisma.$executeRawUnsafe(`REINDEX INDEX CONCURRENTLY "${index}"`)
  }
  return { dryRun: false, rebuilt: searchIndexes }
}

async function reextractMemory() {
  const chapters = await prisma.chapter.findMany({
    where: novelId ? { novelId } : undefined,
    select: { id: true, novelId: true, revision: true, content: true },
    orderBy: [{ novelId: 'asc' }, { orderIndex: 'asc' }],
  })
  if (!apply) return { dryRun: true, chapterCount: chapters.length, instruction: '确认负载后追加 --apply 执行。' }
  let completed = 0
  for (const chapter of chapters) {
    const idempotencyKey = `${chapter.id}:${chapter.revision}`
    const job = await prisma.memoryExtractionJob.upsert({
      where: { idempotencyKey },
      create: {
        novelId: chapter.novelId,
        chapterId: chapter.id,
        chapterRevision: chapter.revision,
        idempotencyKey,
        diff: {
          beforeHash: createHash('sha256').update('').digest('hex'),
          after: chapter.content,
        },
      },
      update: { status: 'pending', leaseUntil: null, errorMessage: null },
    })
    await processMemoryExtractionJob(job.id)
    completed += 1
  }
  return { dryRun: false, completed }
}

async function rolloutMetrics() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const runs = await prisma.agentRun.findMany({
    where: { createdAt: { gte: since }, engine: 'loop' },
    select: { userId: true, status: true, currentTurn: true, startedAt: true, finishedAt: true },
  })
  const groups = new Map<string, typeof runs>()
  for (const run of runs) {
    const variant = resolveAgent2FeatureFlags(run.userId).variant
    groups.set(variant, [...(groups.get(variant) ?? []), run])
  }
  return Object.fromEntries([...groups.entries()].map(([variant, items]) => {
    const terminal = items.filter((item) => item.finishedAt)
    const durations = terminal.map((item) => item.finishedAt!.getTime() - (item.startedAt ?? item.finishedAt!).getTime())
    return [variant, {
      runs: items.length,
      completed: items.filter((item) => item.status === 'completed').length,
      failed: items.filter((item) => item.status === 'failed').length,
      averageTurns: items.length ? Number((items.reduce((sum, item) => sum + item.currentTurn, 0) / items.length).toFixed(2)) : 0,
      averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    }]
  }))
}

const actions: Record<string, () => Promise<unknown>> = {
  diagnose,
  'repair-structure': repairStructure,
  'rebuild-indexes': rebuildIndexes,
  'reextract-memory': reextractMemory,
  'rollout-metrics': rolloutMetrics,
}

try {
  const action = actions[command]
  if (!action) throw new Error(`未知命令 ${command}。可用：${Object.keys(actions).join(', ')}`)
  console.log(JSON.stringify(await action(), null, 2))
} finally {
  await prisma.$disconnect()
}
