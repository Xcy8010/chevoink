import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const demoUserIds = ['user-chevo-writer', 'user-chevo-reader']
const demoUserEmails = ['writer@chevoink.local', 'reader@chevoink.local']
const demoNovelIds = ['novel-aurora', 'novel-cinder']
const demoPostIds = ['post-aurora-01']
const demoTopicIds = ['topic-writing', 'topic-world']
const demoTopicSlugs = ['writing-method', 'worldbuilding']
const demoConversationIds = ['conversation-writer-reader']
const demoAgentSessionIds = ['agent-session-aurora']
const demoAgentRunIds = ['agent-run-aurora-plan']
const demoAgentArtifactIds = ['agent-artifact-aurora-plan']
const demoProjectMemoryIds = ['project-memory-aurora-plan']
const demoCoverAssetIds = ['cover-aurora-01']

async function resolveDemoUserIds() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: demoUserIds } },
        { email: { in: demoUserEmails } },
      ],
    },
    select: { id: true },
  })

  return [...new Set([...demoUserIds, ...users.map((user) => user.id)])]
}

async function resolveDemoNovelIds(userIds) {
  const novels = await prisma.novel.findMany({
    where: {
      OR: [
        { id: { in: demoNovelIds } },
        { authorId: { in: userIds } },
      ],
    },
    select: { id: true },
  })

  return [...new Set([...demoNovelIds, ...novels.map((novel) => novel.id)])]
}

async function resolveDemoChapterIds(userIds, novelIds) {
  const chapters = await prisma.chapter.findMany({
    where: {
      OR: [
        { novelId: { in: novelIds } },
        { authorId: { in: userIds } },
      ],
    },
    select: { id: true },
  })

  return chapters.map((chapter) => chapter.id)
}

async function resolveDemoConversationIds(userIds) {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { id: { in: demoConversationIds } },
        {
          members: {
            some: {
              userId: { in: userIds },
            },
          },
        },
      ],
    },
    select: { id: true },
  })

  return [...new Set([...demoConversationIds, ...conversations.map((conversation) => conversation.id)])]
}

async function main() {
  const userIds = await resolveDemoUserIds()
  const novelIds = await resolveDemoNovelIds(userIds)
  const chapterIds = await resolveDemoChapterIds(userIds, novelIds)
  const conversationIds = await resolveDemoConversationIds(userIds)

  const result = {
    projectMemoryEntries: 0,
    agentArtifacts: 0,
    agentRuns: 0,
    agentSessions: 0,
    aiUsageLogs: 0,
    messages: 0,
    conversationMembers: 0,
    conversations: 0,
    comments: 0,
    posts: 0,
    chapters: 0,
    coverAssets: 0,
    novels: 0,
    topics: 0,
    users: 0,
  }

  result.projectMemoryEntries = (
    await prisma.projectMemoryEntry.deleteMany({
      where: {
        OR: [
          { id: { in: demoProjectMemoryIds } },
          { runId: { in: demoAgentRunIds } },
          { novelId: { in: novelIds } },
          { sourceChapterId: { in: chapterIds } },
        ],
      },
    })
  ).count

  result.agentArtifacts = (
    await prisma.agentArtifact.deleteMany({
      where: {
        OR: [
          { id: { in: demoAgentArtifactIds } },
          { runId: { in: demoAgentRunIds } },
        ],
      },
    })
  ).count

  result.agentRuns = (
    await prisma.agentRun.deleteMany({
      where: {
        OR: [
          { id: { in: demoAgentRunIds } },
          { sessionId: { in: demoAgentSessionIds } },
          { userId: { in: userIds } },
          { novelId: { in: novelIds } },
          { chapterId: { in: chapterIds } },
        ],
      },
    })
  ).count

  result.agentSessions = (
    await prisma.agentSession.deleteMany({
      where: {
        OR: [
          { id: { in: demoAgentSessionIds } },
          { userId: { in: userIds } },
          { novelId: { in: novelIds } },
        ],
      },
    })
  ).count

  result.aiUsageLogs = (
    await prisma.aiUsageLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { novelId: { in: novelIds } },
          { chapterId: { in: chapterIds } },
          { coverAssetId: { in: demoCoverAssetIds } },
        ],
      },
    })
  ).count

  result.messages = (
    await prisma.message.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { senderId: { in: userIds } },
        ],
      },
    })
  ).count

  result.conversationMembers = (
    await prisma.conversationMember.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { userId: { in: userIds } },
        ],
      },
    })
  ).count

  result.conversations = (
    await prisma.conversation.deleteMany({
      where: {
        id: { in: conversationIds },
      },
    })
  ).count

  result.comments = (
    await prisma.comment.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { novelId: { in: novelIds } },
          { chapterId: { in: chapterIds } },
          { postId: { in: demoPostIds } },
          { targetId: { in: [...novelIds, ...chapterIds, ...demoPostIds] } },
        ],
      },
    })
  ).count

  result.posts = (
    await prisma.post.deleteMany({
      where: {
        OR: [
          { id: { in: demoPostIds } },
          { userId: { in: userIds } },
          { relatedNovelId: { in: novelIds } },
        ],
      },
    })
  ).count

  result.chapters = (
    await prisma.chapter.deleteMany({
      where: {
        OR: [
          { id: { in: chapterIds } },
          { novelId: { in: novelIds } },
          { authorId: { in: userIds } },
        ],
      },
    })
  ).count

  result.coverAssets = (
    await prisma.coverAsset.deleteMany({
      where: {
        OR: [
          { id: { in: demoCoverAssetIds } },
          { novelId: { in: novelIds } },
          { ownerUserId: { in: userIds } },
        ],
      },
    })
  ).count

  result.novels = (
    await prisma.novel.deleteMany({
      where: {
        OR: [
          { id: { in: novelIds } },
          { authorId: { in: userIds } },
        ],
      },
    })
  ).count

  result.topics = (
    await prisma.topic.deleteMany({
      where: {
        OR: [
          { id: { in: demoTopicIds } },
          { slug: { in: demoTopicSlugs } },
        ],
      },
    })
  ).count

  result.users = (
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: userIds } },
          { email: { in: demoUserEmails } },
        ],
      },
    })
  ).count

  console.log(JSON.stringify({ cleaned: result, scope: { userIds, novelIds, chapterIds, conversationIds } }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
