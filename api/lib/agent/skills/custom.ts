import { createHash } from 'node:crypto'

import type { Prisma } from '@prisma/client'

import type {
  AgentExecutionMode,
  AgentSkillDraftInput,
  AgentSkillPhase,
  TaskIntent,
} from '../../../../shared/contracts/index.js'
import type { AgentSkill } from './index.js'

const MAX_INSTRUCTION_CHARS = 12_000
const MAX_TRIGGER_COUNT = 24

export type CustomSkillManifest = {
  name: string
  description: string
  version: string
  owner: 'user' | 'agent' | 'third_party'
  license: string
  attribution?: string
  sourcePackage?: string
  intents: TaskIntent[]
  modes: AgentExecutionMode[]
  phases: AgentSkillPhase[]
  triggerPhrases: string[]
  negativeTriggerPhrases: string[]
  tokenBudget: number
  priority: number
}

const forbiddenPatterns: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /(?:忽略|无视|覆盖|绕过).{0,24}(?:系统|开发者|上级|安全|权限|之前.{0,8}指令)/i, message: '包含覆盖系统、开发者、安全或权限指令的尝试。' },
  { pattern: /(?:输出|展示|泄露|窃取|上传).{0,24}(?:密钥|token|cookie|系统提示|system prompt|环境变量)/i, message: '包含读取或泄露密钥、会话或系统提示的尝试。' },
  { pattern: /(?:执行|运行|调用).{0,20}(?:shell|bash|powershell|cmd|终端命令|系统命令)/i, message: '包含执行终端或系统命令的要求。' },
  { pattern: /(?:https?:\/\/|file:\/\/|ftp:\/\/)/i, message: '说明中包含外部或本地资源地址；请改为平台内已审计资源。' },
  { pattern: /(?:不要告诉用户|对用户隐瞒|秘密执行|绕过确认)/i, message: '包含绕过用户知情或确认的要求。' },
]

function normalizeList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function buildCustomSkillArtifacts(
  input: AgentSkillDraftInput,
  version: string,
  owner: 'user' | 'agent' | 'third_party',
  provenance?: { license: string; attribution: string; sourcePackage: string },
): {
  manifest: CustomSkillManifest
  instructions: Partial<Record<AgentSkillPhase, string>>
  contentHash: string
  findings: string[]
} {
  const triggerPhrases = normalizeList(input.triggerPhrases)
  const negativeTriggerPhrases = normalizeList(input.negativeTriggerPhrases)
  const instructions = Object.fromEntries(
    Object.entries(input.instructions)
      .map(([phase, content]) => [phase, content?.trim()])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  ) as Partial<Record<AgentSkillPhase, string>>
  const manifest: CustomSkillManifest = {
    name: input.name.trim(),
    description: input.description.trim(),
    version,
    owner,
    license: provenance?.license ?? 'Proprietary-Author-Owned',
    ...(provenance ? { attribution: provenance.attribution.trim(), sourcePackage: provenance.sourcePackage.trim() } : {}),
    intents: [...new Set(input.intents)],
    modes: [...new Set(input.modes)],
    phases: [...new Set(input.phases)],
    triggerPhrases,
    negativeTriggerPhrases,
    tokenBudget: Math.min(Math.max(input.tokenBudget ?? 500, 100), 1_500),
    priority: Math.min(Math.max(input.priority ?? 70, 0), 150),
  }
  const serialized = JSON.stringify({ manifest, instructions })
  const findings: string[] = []
  const instructionChars = Object.values(instructions).reduce((total, content) => total + (content?.length ?? 0), 0)
  if (triggerPhrases.length === 0) findings.push('至少需要一个明确触发短语。')
  if (triggerPhrases.length > MAX_TRIGGER_COUNT) findings.push(`触发短语最多 ${MAX_TRIGGER_COUNT} 个。`)
  if (negativeTriggerPhrases.length === 0) findings.push('至少需要一个明确不触发短语，避免技能泛化。')
  if (instructionChars === 0) findings.push('至少需要一个阶段的完整技能说明。')
  if (instructionChars > MAX_INSTRUCTION_CHARS) findings.push(`技能说明总长度不能超过 ${MAX_INSTRUCTION_CHARS} 字。`)
  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(serialized)) findings.push(message)
  }
  for (const phase of manifest.phases) {
    if (!instructions[phase]) findings.push(`阶段 ${phase} 缺少对应说明。`)
  }
  return {
    manifest,
    instructions,
    contentHash: createHash('sha256').update(serialized).digest('hex'),
    findings: [...new Set(findings)],
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function customSkillToRuntime(input: {
  id: string
  name: string
  description: string
  source: string
  license: string
  version: string
  manifest: Prisma.JsonValue
  instructions: Prisma.JsonValue
}): AgentSkill | null {
  if (!input.manifest || typeof input.manifest !== 'object' || Array.isArray(input.manifest)) return null
  if (!input.instructions || typeof input.instructions !== 'object' || Array.isArray(input.instructions)) return null
  const manifest = input.manifest as Record<string, unknown>
  const instructions = input.instructions as Record<string, unknown>
  const intents = stringArray(manifest.intents) as TaskIntent[]
  const modes = stringArray(manifest.modes) as AgentExecutionMode[]
  const phases = stringArray(manifest.phases) as AgentSkillPhase[]
  const triggerPhrases = stringArray(manifest.triggerPhrases)
  const negativePhrases = stringArray(manifest.negativeTriggerPhrases)
  if (!intents.length || !modes.length || !phases.length || !triggerPhrases.length) return null
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    version: input.version,
    owner: input.source === 'agent' ? 'agent' : input.source === 'third_party' ? 'third_party' : 'user',
    license: input.license,
    status: 'active',
    intents,
    modes,
    phases,
    strength: 'soft',
    triggers: triggerPhrases.map((phrase) => ({
      pattern: new RegExp(escapeRegExp(phrase), 'i'),
      reasonCode: 'CUSTOM_TRIGGER',
      weight: 34,
    })),
    negativeTriggers: negativePhrases.map((phrase) => new RegExp(escapeRegExp(phrase), 'i')),
    synopsis: typeof manifest.description === 'string' ? manifest.description : input.description,
    resources: Object.fromEntries(
      Object.entries(instructions).filter((entry): entry is [string, string] => phases.includes(entry[0] as AgentSkillPhase) && typeof entry[1] === 'string'),
    ),
    tokenBudget: typeof manifest.tokenBudget === 'number' ? manifest.tokenBudget : 500,
    priority: typeof manifest.priority === 'number' ? manifest.priority : 70,
    conflicts: [],
    composesWith: [],
  }
}
