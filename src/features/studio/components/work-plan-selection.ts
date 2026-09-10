import type { WorkspacePlanFile } from '../types'

export function stablePlanId(plan: Pick<WorkspacePlanFile, 'id' | 'backendArtifactId'>) {
  return plan.backendArtifactId ? `server-${plan.backendArtifactId}` : plan.id
}

/** A failed/in-flight fetch cannot prove that the selected plan was deleted. */
export function reconcilePlanSelection(selection: string, plans: Pick<WorkspacePlanFile, 'id' | 'artifactId'>[], ready: boolean) {
  if (!ready || !selection.startsWith('plan:')) return selection
  const id = selection.slice('plan:'.length)
  const plan = plans.find(item => item.id === id || item.artifactId === id)
  return plan ? `plan:${plan.id}` : 'catalog'
}
