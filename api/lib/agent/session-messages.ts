import type { AgentRollbackSnapshot, AgentUIMessage } from '../../../shared/contracts/index.js'
import type { AgentMessagePart } from '../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../prisma.js'
import { getActiveRunIdBySession, hasActiveRunInSession } from './active-runs.js'

/**
 * 任务会话消息服务（自 run-service.ts 模块级拆分而来，行为原样保留）：
 * 历史消息拉取、单轮删除与快照回滚。
 */

/** 旧版 view_image 把 coverAssetId 直接存进 display 图片地址，前端渲染即破图；
 * 读侧按归属批量反查真实图片地址替换（只读自愈，不改库） */
async function normalizeLegacyViewedImageUrls(userId: string, parts: AgentMessagePart[]): Promise<AgentMessagePart[]> {
  const candidateIds = new Set<string>()
  for (const part of parts) {
    if (part.type !== 'tool-call' || part.display?.kind !== 'viewedImage') continue
    for (const image of part.display.images) {
      if (!image.url.startsWith('http://') && !image.url.startsWith('https://') && !image.url.startsWith('/')) {
        candidateIds.add(image.url)
      }
    }
  }
  if (candidateIds.size === 0) return parts

  const assets = await prisma.coverAsset.findMany({
    where: { id: { in: Array.from(candidateIds) }, ownerUserId: userId },
    select: { id: true, imageUrl: true },
  })
  if (assets.length === 0) return parts
  const urlById = new Map(assets.map((asset) => [asset.id, asset.imageUrl] as const))

  return parts.map((part) => {
    if (part.type !== 'tool-call' || part.display?.kind !== 'viewedImage') return part
    let changed = false
    const images = part.display.images.map((image) => {
      const resolved = urlById.get(image.url)
      if (!resolved) return image
      changed = true
      return { ...image, url: resolved }
    })
    return changed ? { ...part, display: { ...part.display, images } } : part
  })
}

/** 拉取会话消息（parts 结构），用于历史恢复与切换会话；回滚快照仅服务端使用，返回前剥离；
 * 附带 activeRunId：前端刷新后据此续接进行中的任务直播 */
export async function listLoopSessionMessages(
  userId: string,
  sessionId: string,
): Promise<{ messages: AgentUIMessage[]; activeRunId: string | null }> {
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  })

  if (!session) {
    throw new DataAccessError(404, 'NOT_FOUND', '会话不存在或无权访问。')
  }

  const records = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  const messages: AgentUIMessage[] = []
  for (const record of records) {
    const stripped = (record.parts as unknown as AgentMessagePart[]).map((part) =>
      part.type === 'tool-call' && part.snapshot ? { ...part, snapshot: undefined } : part,
    )
    messages.push({
      id: record.id,
      runId: record.runId,
      role: record.role as 'user' | 'assistant',
      parts: await normalizeLegacyViewedImageUrls(userId, stripped),
      createdAt: record.createdAt.toISOString(),
    })
  }

  return { messages, activeRunId: getActiveRunIdBySession(sessionId) }
}

async function findOwnedSessionMessage(userId: string, sessionId: string, messageId: string) {
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, novelId: true },
  })

  if (!session) {
    throw new DataAccessError(404, 'NOT_FOUND', '会话不存在或无权访问。')
  }

  const message = await prisma.agentMessage.findFirst({
    where: { id: messageId, sessionId },
  })

  if (!message) {
    throw new DataAccessError(404, 'NOT_FOUND', '消息不存在或已被删除。')
  }

  if (hasActiveRunInSession(sessionId)) {
    throw new DataAccessError(409, 'RUN_IN_PROGRESS', '当前会话有任务正在执行，请先停止后再操作。')
  }

  return { session, message }
}

/** 删除一轮对话：按消息所属 run 整轮删除（级联清理消息/事件），不恢复工作区内容 */
export async function deleteLoopSessionMessage(
  userId: string,
  sessionId: string,
  messageId: string,
): Promise<{ deleted: true; runId: string }> {
  const { message } = await findOwnedSessionMessage(userId, sessionId, messageId)

  await prisma.$transaction(async (tx) => {
    await tx.projectMemoryEntry.deleteMany({ where: { runId: message.runId } })
    await tx.agentArtifact.deleteMany({ where: { runId: message.runId } })
    await tx.agentRun.delete({ where: { id: message.runId } }).catch(() => {})
  })

  return { deleted: true, runId: message.runId }
}

type CollectedRollback =
  | { kind: 'snapshot'; snapshot: AgentRollbackSnapshot }
  | { kind: 'created_chapter'; chapterId: string }

/** 从一批消息中按时间正序收集可回滚动作（快照 + 新建章节） */
function collectRollbackActions(records: Array<{ parts: unknown }>): CollectedRollback[] {
  const actions: CollectedRollback[] = []

  for (const record of records) {
    const parts = record.parts as AgentMessagePart[]
    if (!Array.isArray(parts)) {
      continue
    }
    for (const part of parts) {
      if (part.type !== 'tool-call' || part.status !== 'success') {
        continue
      }
      if (part.toolName === 'chapter_create' && part.display?.kind === 'chapterRef') {
        actions.push({ kind: 'created_chapter', chapterId: part.display.chapterId })
        continue
      }
      if (part.snapshot) {
        actions.push({ kind: 'snapshot', snapshot: part.snapshot })
      }
    }
  }

  return actions
}

/**
 * 回退到某轮对话之前：逆序重放该轮及之后所有写操作的快照（新建章节直接删除），
 * 然后删除这些 run（级联清理消息/事件/记忆/产物）。
 */
export async function rollbackLoopSessionFromMessage(
  userId: string,
  sessionId: string,
  messageId: string,
): Promise<{ rolledBack: true; removedRunCount: number }> {
  const { session, message } = await findOwnedSessionMessage(userId, sessionId, messageId)

  const targetRun = await prisma.agentRun.findUnique({
    where: { id: message.runId },
    select: { id: true, createdAt: true },
  })

  if (!targetRun) {
    throw new DataAccessError(404, 'NOT_FOUND', '对应的任务记录不存在。')
  }

  const runs = await prisma.agentRun.findMany({
    where: { sessionId, createdAt: { gte: targetRun.createdAt } },
    select: { id: true },
  })
  const runIds = runs.map((run) => run.id)

  const records = await prisma.agentMessage.findMany({
    where: { runId: { in: runIds } },
    orderBy: { createdAt: 'asc' },
    select: { parts: true },
  })

  // 后发生的先恢复：同一字段多次写入时最终回到最早的 previousValue
  const actions = collectRollbackActions(records).reverse()

  await prisma.$transaction(async (tx) => {
    for (const action of actions) {
      if (action.kind === 'created_chapter') {
        await tx.chapter.deleteMany({ where: { id: action.chapterId, novelId: session.novelId } })
        continue
      }

      const { snapshot } = action
      if (snapshot.target === 'chapter') {
        const exists = await tx.chapter.findFirst({
          where: { id: snapshot.targetId, novelId: session.novelId },
          select: { id: true },
        })
        if (!exists) {
          continue
        }
        if (snapshot.field === 'content') {
          const content = snapshot.previousValue ?? ''
          await tx.chapter.update({
            where: { id: snapshot.targetId },
            data: { content, wordCount: content.length, revision: { increment: 1 } },
          })
        } else if (snapshot.field === 'title') {
          await tx.chapter.update({
            where: { id: snapshot.targetId },
            data: { title: snapshot.previousValue ?? '', revision: { increment: 1 } },
          })
        }
        continue
      }

      // novel 字段快照：白名单内逐字段恢复，status 需要枚举合法才写回
      if (snapshot.field === 'title' && snapshot.previousValue !== null) {
        await tx.novel.update({ where: { id: session.novelId }, data: { title: snapshot.previousValue } })
      } else if (snapshot.field === 'summary') {
        await tx.novel.update({ where: { id: session.novelId }, data: { summary: snapshot.previousValue ?? '' } })
      } else if (snapshot.field === 'coverPrompt') {
        await tx.novel.update({ where: { id: session.novelId }, data: { coverPrompt: snapshot.previousValue } })
      } else if (snapshot.field === 'coverAssetId') {
        await tx.novel.update({ where: { id: session.novelId }, data: { coverAssetId: snapshot.previousValue } })
      } else if (
        snapshot.field === 'status' &&
        (snapshot.previousValue === 'draft' ||
          snapshot.previousValue === 'published' ||
          snapshot.previousValue === 'completed' ||
          snapshot.previousValue === 'archived')
      ) {
        await tx.novel.update({
          where: { id: session.novelId },
          data: { status: snapshot.previousValue },
        })
      }
    }

    // 回滚可能删除中间插入章：提交前恢复连续顺序，并让被前移章节的 revision 失效旧编辑基线
    const orderedChapters = await tx.chapter.findMany({
      where: { novelId: session.novelId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, orderIndex: true },
    })
    for (let index = 0; index < orderedChapters.length; index += 1) {
      const expectedOrder = index + 1
      if (orderedChapters[index].orderIndex !== expectedOrder) {
        await tx.chapter.update({
          where: { id: orderedChapters[index].id },
          data: { orderIndex: expectedOrder, revision: { increment: 1 } },
        })
      }
    }

    // 重算作品统计（章节数/总字数）
    const chapters = await tx.chapter.findMany({
      where: { novelId: session.novelId },
      select: { wordCount: true },
    })
    await tx.novel.update({
      where: { id: session.novelId },
      data: {
        chapterCount: chapters.length,
        wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      },
    })

    await tx.projectMemoryEntry.deleteMany({ where: { runId: { in: runIds } } })
    await tx.agentArtifact.deleteMany({ where: { runId: { in: runIds } } })
    await tx.agentRun.deleteMany({ where: { id: { in: runIds } } })
  })

  return { rolledBack: true, removedRunCount: runIds.length }
}
