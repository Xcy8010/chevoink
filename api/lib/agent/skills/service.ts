import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

import type {
  AgentSkillListItem,
  AgentSkillRunSummary,
  NovelSkillsPayload,
  UpdateNovelSkillRequest,
} from '../../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../../prisma.js'
import { skillCatalog, type AgentSkill } from './index.js'

const BUILTIN_SOURCE = 'builtin'
const NOVEL_SCOPE = 'novel'

function manifestFor(skill: AgentSkill): Prisma.InputJsonObject {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    owner: skill.owner,
    license: skill.license,
    ...(skill.attribution ? { attribution: skill.attribution } : {}),
    status: skill.status,
    intents: skill.intents,
    modes: skill.modes,
    phases: skill.phases,
    triggers: skill.triggers.map((trigger) => ({
      pattern: trigger.pattern.source,
      reasonCode: trigger.reasonCode,
      weight: trigger.weight,
    })),
    negativeTriggers: skill.negativeTriggers.map((pattern) => pattern.source),
    tokenBudget: skill.tokenBudget,
    priority: skill.priority,
    conflicts: skill.conflicts,
    composesWith: skill.composesWith,
  }
}

function instructionsFor(skill: AgentSkill): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(skill.resources).filter((entry) => Boolean(entry[1]))) as Prisma.InputJsonObject
}

function contentHash(skill: AgentSkill): string {
  return createHash('sha256')
    .update(JSON.stringify({ manifest: manifestFor(skill), instructions: instructionsFor(skill) }))
    .digest('hex')
}

/** 内置目录是代码资产；同步只做幂等 upsert，版本内容一旦存在不被覆盖。 */
export async function syncBuiltinSkillCatalog(): Promise<void> {
  const definitionOperations = skillCatalog.map((skill) => prisma.agentSkillDefinition.upsert({
    where: { id: skill.id },
    create: {
      id: skill.id,
      ownerUserId: null,
      name: skill.name,
      description: skill.description,
      source: BUILTIN_SOURCE,
      visibility: 'builtin',
      license: skill.license,
      status: skill.status,
      defaultVersion: skill.version,
    },
    update: {
      name: skill.name,
      description: skill.description,
      license: skill.license,
      status: skill.status,
      defaultVersion: skill.version,
    },
  }))
  await prisma.$transaction(definitionOperations)

  const versionOperations = skillCatalog.map((skill) => prisma.agentSkillVersion.upsert({
    where: { skillId_version: { skillId: skill.id, version: skill.version } },
    create: {
      skillId: skill.id,
      version: skill.version,
      instructions: instructionsFor(skill),
      manifest: manifestFor(skill),
      contentHash: contentHash(skill),
      status: 'active',
    },
    // 不可变版本：同一 skillId@version 已存在时禁止静默改写内容。
    update: {},
  }))
  await prisma.$transaction(versionOperations)
}

async function assertOwnedNovel(userId: string, novelId: string): Promise<void> {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, authorId: userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权访问。')
}

async function ensureNovelInstallations(userId: string, novelId: string): Promise<void> {
  await syncBuiltinSkillCatalog()
  await prisma.agentSkillInstallation.createMany({
    data: skillCatalog.map((skill) => ({
      skillId: skill.id,
      userId,
      scope: NOVEL_SCOPE,
      scopeId: novelId,
      enabled: true,
      lockedVersion: skill.version,
      priority: skill.priority,
    })),
    skipDuplicates: true,
  })
}

function readSelected(value: Prisma.JsonValue): Array<{ id: string; name: string; version: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.version === 'string'
      ? [{ id: record.id, name: record.name, version: record.version }]
      : []
  })
}

function readStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function listNovelSkills(userId: string, novelId: string): Promise<NovelSkillsPayload> {
  await assertOwnedNovel(userId, novelId)
  await ensureNovelInstallations(userId, novelId)

  const [definitions, installations, runs] = await Promise.all([
    prisma.agentSkillDefinition.findMany({
      where: { status: 'active', OR: [{ source: BUILTIN_SOURCE }, { ownerUserId: userId }] },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
      orderBy: [{ source: 'asc' }, { name: 'asc' }],
    }),
    prisma.agentSkillInstallation.findMany({
      where: { userId, scope: NOVEL_SCOPE, scopeId: novelId },
    }),
    prisma.agentSkillRun.findMany({
      where: { userId, novelId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  const installationBySkill = new Map(installations.map((installation) => [installation.skillId, installation]))
  const runtimeById = new Map(skillCatalog.map((skill) => [skill.id, skill]))
  const usageBySkill = new Map<string, { count: number; lastUsedAt: Date }>()
  for (const run of runs) {
    for (const selected of readSelected(run.selected)) {
      const current = usageBySkill.get(selected.id)
      usageBySkill.set(selected.id, {
        count: (current?.count ?? 0) + 1,
        lastUsedAt: current?.lastUsedAt ?? run.createdAt,
      })
    }
  }

  const items: AgentSkillListItem[] = definitions.map((definition) => {
    const installation = installationBySkill.get(definition.id)
    const runtime = runtimeById.get(definition.id)
    const usage = usageBySkill.get(definition.id)
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      source: definition.source as AgentSkillListItem['source'],
      license: definition.license,
      status: definition.status as AgentSkillListItem['status'],
      defaultVersion: definition.defaultVersion,
      activeVersion: installation?.lockedVersion ?? definition.defaultVersion,
      enabled: installation?.enabled ?? true,
      phases: runtime?.phases ?? [],
      triggerLabels: runtime?.triggers.map((trigger) => trigger.reasonCode) ?? [],
      negativeTriggerLabels: runtime?.negativeTriggers.map((pattern) => pattern.source) ?? [],
      tokenBudget: runtime?.tokenBudget ?? 0,
      priority: installation?.priority ?? runtime?.priority ?? 0,
      lastUsedAt: usage?.lastUsedAt.toISOString() ?? null,
      usageCount: usage?.count ?? 0,
      versions: definition.versions.map((version) => ({
        version: version.version,
        status: version.status as AgentSkillListItem['status'],
        contentHash: version.contentHash,
        createdAt: version.createdAt.toISOString(),
      })),
    }
  })

  const recentRuns: AgentSkillRunSummary[] = runs.slice(0, 8).map((run) => ({
    runId: run.runId,
    phase: run.phase,
    selected: readSelected(run.selected),
    reasonCodes: readStrings(run.reasonCodes),
    confidence: run.confidence,
    estimatedTokens: run.estimatedTokens,
    createdAt: run.createdAt.toISOString(),
  }))

  return {
    items,
    recentRuns,
    enabledCount: items.filter((item) => item.enabled).length,
    totalCount: items.length,
  }
}

export async function updateNovelSkill(
  userId: string,
  novelId: string,
  skillId: string,
  patch: UpdateNovelSkillRequest,
): Promise<NovelSkillsPayload> {
  await assertOwnedNovel(userId, novelId)
  await ensureNovelInstallations(userId, novelId)
  const definition = await prisma.agentSkillDefinition.findFirst({
    where: { id: skillId, status: 'active', OR: [{ source: BUILTIN_SOURCE }, { ownerUserId: userId }] },
    select: { id: true, defaultVersion: true },
  })
  if (!definition) throw new DataAccessError(404, 'SKILL_NOT_FOUND', '技能不存在或无权访问。')

  const lockedVersion = patch.lockedVersion === undefined ? undefined : patch.lockedVersion ?? definition.defaultVersion
  if (lockedVersion) {
    const version = await prisma.agentSkillVersion.findUnique({
      where: { skillId_version: { skillId, version: lockedVersion } },
      select: { id: true },
    })
    if (!version) throw new DataAccessError(409, 'SKILL_VERSION_NOT_FOUND', '指定的技能版本不存在，无法回滚。')
  }

  await prisma.agentSkillInstallation.update({
    where: { skillId_userId_scope_scopeId: { skillId, userId, scope: NOVEL_SCOPE, scopeId: novelId } },
    data: {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(lockedVersion !== undefined ? { lockedVersion } : {}),
    },
  })
  return listNovelSkills(userId, novelId)
}

/** 路由热路径不做目录同步；没有安装记录等价于默认启用，关闭后下一轮立即生效。 */
export async function resolveEnabledBuiltinSkillIds(userId: string, novelId: string): Promise<Set<string>> {
  const installations = await prisma.agentSkillInstallation.findMany({
    where: { userId, scope: NOVEL_SCOPE, scopeId: novelId },
    select: { skillId: true, enabled: true },
  })
  const enabledById = new Map(installations.map((installation) => [installation.skillId, installation.enabled]))
  return new Set(skillCatalog.filter((skill) => enabledById.get(skill.id) !== false).map((skill) => skill.id))
}
