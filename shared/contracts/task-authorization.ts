import { z } from 'zod'

const id = z.string().min(1).max(200).refine(value => value === value.trim(), 'Identity must be canonical')
const exactTarget = <const Effect extends string, const Kind extends string>(effect: Effect, kind: Kind) => z.object({
  effect: z.literal(effect), target: z.object({ kind: z.literal(kind), id }).strict(),
}).strict()

/** Explicit effects, not tool names or natural-language keywords. No wildcard write grant. */
export const taskEffectGrantSchema = z.discriminatedUnion('effect', [
  exactTarget('read_sources', 'novel'),
  exactTarget('read_workspace', 'novel'),
  exactTarget('deliver_report', 'task'),
  exactTarget('manage_task', 'task'),
  exactTarget('write_plan', 'plan'),
  exactTarget('write_chapter', 'chapter'),
  exactTarget('mutate_structure', 'novel'),
  exactTarget('mutate_memory', 'novel'),
  exactTarget('publish', 'novel'),
  exactTarget('spawn_task', 'task'),
  // Creation uses a server-reserved output slot, not an arbitrary title or guessed chapter ID.
  exactTarget('create_plan', 'output_slot'),
  exactTarget('create_chapter', 'output_slot'),
])

export const taskAuthorizationBindingSchema = z.object({
  userId: id,
  sessionId: id,
  novelId: id,
  taskRootId: id,
}).strict()

const phaseSchema = z.object({
  id,
  purpose: z.enum(['research_analysis', 'report_delivery', 'writing', 'revision', 'structure']),
  grants: z.array(taskEffectGrantSchema).max(128),
}).strict().superRefine((phase, ctx) => {
  const researchEffects = new Set(['read_sources', 'read_workspace', 'deliver_report', 'manage_task'])
  const reportEffects = new Set([...researchEffects, 'write_plan', 'create_plan'])
  const seen = new Set<string>()
  for (const [index, grant] of phase.grants.entries()) {
    const key = JSON.stringify(grant)
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['grants', index], message: 'Duplicate effect grant' })
    seen.add(key)
    if ((phase.purpose === 'research_analysis' && !researchEffects.has(grant.effect))
      || (phase.purpose === 'report_delivery' && !reportEffects.has(grant.effect))) {
      ctx.addIssue({ code: 'custom', path: ['grants', index], message: 'Effect exceeds phase purpose' })
    }
  }
})

/**
 * Server-issued, JSON-persistable scope. The schema validates structure, not user consent.
 * The admission service must verify request/confirmation provenance before issuing one.
 * Never accept a model's proposed contract, a checkpoint summary or a client POST as authority.
 */
export const taskAuthorizationSchema = z.object({
  version: z.literal(1),
  id,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  binding: taskAuthorizationBindingSchema,
  provenance: z.object({
    kind: z.enum(['explicit_user_request', 'confirmed_user_proposal']),
    userMessageId: id,
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  status: z.enum(['active', 'revoked', 'completed']),
  phases: z.array(phaseSchema).min(1).max(16),
  activePhaseId: id.nullable(),
  completedPhases: z.array(z.object({
    phaseId: id,
    completionReceiptId: id,
  }).strict()).max(16),
}).strict().superRefine((authorization, ctx) => {
  const phases = authorization.phases
  const phaseIds = phases.map(phase => phase.id)
  if (new Set(phaseIds).size !== phaseIds.length) {
    ctx.addIssue({ code: 'custom', path: ['phases'], message: 'Duplicate phase identity' })
  }
  const receipts = authorization.completedPhases
  if (receipts.length > phases.length || receipts.some((receipt, index) => receipt.phaseId !== phaseIds[index])) {
    ctx.addIssue({ code: 'custom', path: ['completedPhases'], message: 'Completed phases must be an ordered prefix' })
  }
  if (new Set(receipts.map(receipt => receipt.completionReceiptId)).size !== receipts.length) {
    ctx.addIssue({ code: 'custom', path: ['completedPhases'], message: 'Each phase needs its own completion receipt' })
  }
  const expectedActive = phaseIds[receipts.length] ?? null
  if (authorization.status === 'active' && (!expectedActive || authorization.activePhaseId !== expectedActive)) {
    ctx.addIssue({ code: 'custom', path: ['activePhaseId'], message: 'Active phase must follow the completed prefix' })
  }
  if (authorization.status !== 'active' && authorization.activePhaseId !== null) {
    ctx.addIssue({ code: 'custom', path: ['activePhaseId'], message: 'Terminal authorization has no active phase' })
  }
  if (authorization.status === 'completed' && receipts.length !== phases.length) {
    ctx.addIssue({ code: 'custom', path: ['completedPhases'], message: 'Completion requires every phase receipt' })
  }
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const [grantIndex, grant] of phase.grants.entries()) {
      const target = grant.target
      if ((target.kind === 'novel' && target.id !== authorization.binding.novelId)
        || (target.kind === 'task' && target.id !== authorization.binding.taskRootId)) {
        ctx.addIssue({ code: 'custom', path: ['phases', phaseIndex, 'grants', grantIndex], message: 'Grant exceeds bound task/novel' })
      }
    }
  }
})

export type TaskEffectGrant = z.infer<typeof taskEffectGrantSchema>
export type TaskAuthorizationBinding = z.infer<typeof taskAuthorizationBindingSchema>
export type TaskAuthorization = z.infer<typeof taskAuthorizationSchema>
