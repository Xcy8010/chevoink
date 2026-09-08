import {
  taskAuthorizationSchema, taskEffectGrantSchema,
  type TaskAuthorization, type TaskAuthorizationBinding, type TaskEffectGrant,
} from '../../../shared/contracts/task-authorization.js'
import { DataAccessError } from '../prisma.js'

type AuthorizationDecision = { allowed: true; authorizationId: string; revision: number; phaseId: string }
  | { allowed: false; code: 'AUTHORIZATION_MISSING' | 'AUTHORIZATION_INVALID' | 'AUTHORIZATION_SCOPE_MISMATCH' | 'AUTHORIZATION_INACTIVE' | 'EFFECT_NOT_AUTHORIZED' }

/** Evaluate a server-loaded contract; matching schema alone is never proof of user consent. */
export function authorizeTaskEffects(
  raw: unknown,
  binding: TaskAuthorizationBinding,
  effects: readonly TaskEffectGrant[],
): AuthorizationDecision {
  if (raw === undefined) return { allowed: false, code: 'AUTHORIZATION_MISSING' }
  const parsed = taskAuthorizationSchema.safeParse(raw)
  if (!parsed.success) return { allowed: false, code: 'AUTHORIZATION_INVALID' }
  const authorization = parsed.data
  if (authorization.binding.userId !== binding.userId || authorization.binding.sessionId !== binding.sessionId
    || authorization.binding.novelId !== binding.novelId || authorization.binding.taskRootId !== binding.taskRootId) {
    return { allowed: false, code: 'AUTHORIZATION_SCOPE_MISMATCH' }
  }
  const phase = authorization.phases.find(item => item.id === authorization.activePhaseId)
  if (authorization.status !== 'active' || !phase) return { allowed: false, code: 'AUTHORIZATION_INACTIVE' }
  // An empty/unknown effect declaration cannot accidentally authorize an unreviewed tool.
  if (effects.length === 0 || effects.length > 128 || effects.some(effect => !taskEffectGrantSchema.safeParse(effect).success
    || !phase.grants.some(grant => grant.effect === effect.effect
      && grant.target.kind === effect.target.kind && grant.target.id === effect.target.id))) {
    return { allowed: false, code: 'EFFECT_NOT_AUTHORIZED' }
  }
  return { allowed: true, authorizationId: authorization.id, revision: authorization.revision, phaseId: phase.id }
}

/**
 * Resume must distinguish an old document from a corrupt/new-version authorization.
 * Present-but-invalid authorization must never fall through to buildTaskSpec's legacy defaults.
 */
export function readStoredTaskAuthorization(rawSpec: unknown, binding: Omit<TaskAuthorizationBinding, 'taskRootId'>):
  | { kind: 'legacy' }
  | { kind: 'authorized'; authorization: TaskAuthorization }
  | { kind: 'invalid' } {
  if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) return { kind: 'legacy' }
  if (!Object.prototype.hasOwnProperty.call(rawSpec, 'authorization')) return { kind: 'legacy' }
  const spec = rawSpec as Record<string, unknown>
  const parsed = taskAuthorizationSchema.safeParse(spec.authorization)
  if (!parsed.success || typeof spec.id !== 'string') return { kind: 'invalid' }
  const scope = spec.scope
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)
    || !('novelId' in scope) || scope.novelId !== binding.novelId) return { kind: 'invalid' }
  const subject = parsed.data.binding
  if (subject.taskRootId !== spec.id || subject.userId !== binding.userId || subject.sessionId !== binding.sessionId
    || subject.novelId !== binding.novelId) return { kind: 'invalid' }
  return { kind: 'authorized', authorization: parsed.data }
}

/**
 * Expansion fence: no issuer is enabled yet. J3 must replace this fence with durable
 * admission/effect checks before any V1 authorization can execute. In particular, a
 * valid new contract is not permission for the old loop to ignore it and run freely.
 */
export function assertTaskAuthorizationRuntimeReady(rawSpec: unknown, binding: Omit<TaskAuthorizationBinding, 'taskRootId'>): void {
  const restored = readStoredTaskAuthorization(rawSpec, binding)
  if (restored.kind === 'legacy') return
  if (restored.kind === 'invalid') {
    throw new DataAccessError(409, 'TASK_AUTHORIZATION_INVALID', '任务授权记录无效或不属于当前任务，已阻止恢复；不会回退为旧写作任务。')
  }
  throw new DataAccessError(409, 'TASK_AUTHORIZATION_NOT_ACTIVATED', '此任务使用新版阶段授权；持久授权执行器尚未启用，已阻止旧执行器忽略授权运行。')
}
