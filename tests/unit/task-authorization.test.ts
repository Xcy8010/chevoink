import { describe, expect, it } from 'vitest'
import { taskAuthorizationSchema, type TaskAuthorization, type TaskEffectGrant } from '../../shared/contracts/task-authorization.js'
import { taskSpecSchema } from '../../shared/contracts/task-spec-contracts.js'
import { assertTaskAuthorizationRuntimeReady, authorizeTaskEffects, readStoredTaskAuthorization } from '../../api/lib/agent/task-authorization.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'

const binding = { userId: 'user', sessionId: 'session', novelId: 'novel', taskRootId: 'root' }
const read: TaskEffectGrant = { effect: 'read_workspace', target: { kind: 'novel', id: 'novel' } }
const plan: TaskEffectGrant = { effect: 'write_plan', target: { kind: 'plan', id: 'report-plan' } }
const chapter: TaskEffectGrant = { effect: 'write_chapter', target: { kind: 'chapter', id: 'chapter-19' } }

function contract(): TaskAuthorization {
  return {
    version: 1, id: 'authorization', revision: 1, binding: { ...binding },
    provenance: { kind: 'confirmed_user_proposal', userMessageId: 'user-message', requestSha256: 'a'.repeat(64) },
    status: 'active', activePhaseId: 'research', completedPhases: [],
    phases: [
      { id: 'research', purpose: 'research_analysis', grants: [read, { effect: 'deliver_report', target: { kind: 'task', id: 'root' } }] },
      { id: 'save-report', purpose: 'report_delivery', grants: [read, plan] },
      { id: 'write', purpose: 'writing', grants: [read, chapter] },
    ],
  }
}
function atPhase(index: number): TaskAuthorization {
  const result = contract()
  result.activePhaseId = result.phases[index].id
  result.completedPhases = result.phases.slice(0, index).map(phase => ({ phaseId: phase.id, completionReceiptId: `receipt-${phase.id}` }))
  return result
}

describe('versioned task effect contract (not natural-language consent inference)', () => {
  it('retains authorization through the existing TaskSpec JSON field', () => {
    const spec = { ...buildTaskSpec({ runId: 'run', novelId: 'novel', chapterId: null, prompt: '分析并保存报告' }), id: 'root', authorization: contract() }
    const restored = taskSpecSchema.parse(JSON.parse(JSON.stringify(spec)))
    expect(restored.authorization).toEqual(spec.authorization)
    expect(readStoredTaskAuthorization(restored, binding)).toEqual({ kind: 'authorized', authorization: contract() })
    expect(taskSpecSchema.safeParse({ ...spec, id: 'other-root' }).success).toBe(false)
    expect(taskSpecSchema.safeParse({ ...spec, scope: { novelId: 'other-novel' } }).success).toBe(false)
  })

  it('a read-only phase cannot spend permissions granted only to later phases', () => {
    expect(authorizeTaskEffects(contract(), binding, [read]).allowed).toBe(true)
    expect(authorizeTaskEffects(contract(), binding, [plan])).toEqual({ allowed: false, code: 'EFFECT_NOT_AUTHORIZED' })
    expect(authorizeTaskEffects(contract(), binding, [chapter]).allowed).toBe(false)
  })

  it('saving the specific report does not unlock chapters or other plans', () => {
    expect(authorizeTaskEffects(atPhase(1), binding, [plan]).allowed).toBe(true)
    expect(authorizeTaskEffects(atPhase(1), binding, [chapter]).allowed).toBe(false)
    expect(authorizeTaskEffects(atPhase(1), binding, [{ ...plan, target: { kind: 'plan', id: 'old-plan' } }]).allowed).toBe(false)
  })

  it('a writing phase admits the authorized chapter but not old chapter 13 or 14', () => {
    expect(authorizeTaskEffects(atPhase(2), binding, [chapter]).allowed).toBe(true)
    for (const id of ['chapter-13', 'chapter-14']) {
      expect(authorizeTaskEffects(atPhase(2), binding, [{ ...chapter, target: { kind: 'chapter', id } }]).allowed).toBe(false)
    }
  })

  it.each(['userId', 'sessionId', 'novelId', 'taskRootId'] as const)('cannot reuse a contract across %s', key => {
    expect(authorizeTaskEffects(contract(), { ...binding, [key]: 'different' }, [read])).toEqual({ allowed: false, code: 'AUTHORIZATION_SCOPE_MISMATCH' })
  })

  it('requires every declared effect; no empty declaration or partial intersection bypass', () => {
    expect(authorizeTaskEffects(contract(), binding, []).allowed).toBe(false)
    expect(authorizeTaskEffects(contract(), binding, [read, chapter]).allowed).toBe(false)
    expect(authorizeTaskEffects(contract(), binding, [{ effect: 'unknown', target: { kind: 'novel', id: 'novel' } } as unknown as TaskEffectGrant]).allowed).toBe(false)
  })

  it.each(['revoked', 'completed'] as const)('never executes under a %s contract', status => {
    const value = contract()
    value.status = status
    value.activePhaseId = null
    if (status === 'completed') value.completedPhases = value.phases.map(phase => ({ phaseId: phase.id, completionReceiptId: `receipt-${phase.id}` }))
    expect(authorizeTaskEffects(value, binding, [read])).toEqual({ allowed: false, code: 'AUTHORIZATION_INACTIVE' })
  })

  it.each([
    ['unknown version', (p: TaskAuthorization) => ({ ...p, version: 2 })],
    ['phase jump without receipts', (p: TaskAuthorization) => ({ ...p, activePhaseId: 'write' })],
    ['duplicate phase ID', (p: TaskAuthorization) => ({ ...p, phases: [p.phases[0], p.phases[0]] })],
    ['out-of-order receipt', (p: TaskAuthorization) => ({ ...p, completedPhases: [{ phaseId: 'save-report', completionReceiptId: 'receipt' }] })],
    ['foreign novel', (p: TaskAuthorization) => ({ ...p, phases: [{ ...p.phases[0], grants: [{ ...read, target: { kind: 'novel', id: 'other' } }] }] })],
    ['chapter writing in research', (p: TaskAuthorization) => ({ ...p, phases: [{ ...p.phases[0], grants: [chapter] }] })],
    ['chapter writing in report', (p: TaskAuthorization) => ({ ...p, phases: [{ ...p.phases[0], purpose: 'report_delivery', grants: [chapter] }] })],
    ['unknown source of consent', (p: TaskAuthorization) => ({ ...p, provenance: { ...p.provenance, kind: 'model_output' } })],
    ['extra override field', (p: TaskAuthorization) => ({ ...p, fullAccess: true })],
    ['noncanonical identity', (p: TaskAuthorization) => ({ ...p, id: ' authorization ' })],
    ['wildcard target', (p: TaskAuthorization) => ({ ...p, phases: [{ ...p.phases[0], grants: [{ effect: 'write_chapter', target: { kind: 'all', id: '*' } }] }] })],
  ] as const)('rejects %s', (_name, change) => {
    const invalid = change(contract())
    expect(taskAuthorizationSchema.safeParse(invalid).success).toBe(false)
    expect(authorizeTaskEffects(invalid, binding, [read])).toEqual({ allowed: false, code: 'AUTHORIZATION_INVALID' })
  })

  it('rejects duplicate receipts or duplicate grants', () => {
    const value = atPhase(2)
    value.completedPhases[1].completionReceiptId = value.completedPhases[0].completionReceiptId
    expect(taskAuthorizationSchema.safeParse(value).success).toBe(false)
    const duplicatedGrant = contract()
    duplicatedGrant.phases[0].grants.push(read)
    expect(taskAuthorizationSchema.safeParse(duplicatedGrant).success).toBe(false)
  })

  it('keeps missing legacy authorization distinct from malformed present authorization', () => {
    expect(readStoredTaskAuthorization({ id: 'old-root' }, binding)).toEqual({ kind: 'legacy' })
    for (const authorization of [null, {}, { ...contract(), version: 99 }]) {
      expect(readStoredTaskAuthorization({ id: 'root', authorization }, binding)).toEqual({ kind: 'invalid' })
    }
    expect(authorizeTaskEffects(undefined, binding, [read])).toEqual({ allowed: false, code: 'AUTHORIZATION_MISSING' })
  })

  it('does not inherit a serialized grant into a fork, new task, or another owner', () => {
    const spec = { id: 'root', scope: { novelId: 'novel' }, authorization: contract() }
    expect(readStoredTaskAuthorization(spec, binding).kind).toBe('authorized')
    expect(readStoredTaskAuthorization({ ...spec, id: 'new-root' }, binding)).toEqual({ kind: 'invalid' })
    expect(readStoredTaskAuthorization(spec, { ...binding, sessionId: 'fork' })).toEqual({ kind: 'invalid' })
    expect(readStoredTaskAuthorization(spec, { ...binding, userId: 'another-user' })).toEqual({ kind: 'invalid' })
    expect(readStoredTaskAuthorization({ ...spec, scope: { novelId: 'other' } }, binding)).toEqual({ kind: 'invalid' })
  })

  it('does not activate a structurally valid new contract in the legacy execution engine', () => {
    const spec = { id: 'root', scope: { novelId: 'novel' }, authorization: contract() }
    expect(() => assertTaskAuthorizationRuntimeReady(spec, binding)).toThrow(expect.objectContaining({ code: 'TASK_AUTHORIZATION_NOT_ACTIVATED' }))
    expect(() => assertTaskAuthorizationRuntimeReady({ id: 'legacy' }, binding)).not.toThrow()
  })
})
