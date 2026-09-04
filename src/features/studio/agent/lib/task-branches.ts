import type { AgentSession } from '../../../../../shared/contracts/index.js'

export type AgentTaskBranchRow = {
  session: AgentSession
  depth: number
  childCount: number
}

function sessionTime(session: AgentSession) {
  const parsed = new Date(session.lastRunAt ?? session.updatedAt).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * 将真实任务 fork 关系展平成可渲染的分支树。服务端数据异常（缺父节点、循环）时，
 * 未访问任务会自动回落为根节点，确保管理页不会因为一条坏数据整页不可用。
 */
export function buildAgentTaskBranchRows(sessions: AgentSession[]): AgentTaskBranchRow[] {
  const ordered = [...sessions].sort((left, right) => sessionTime(right) - sessionTime(left))
  const byId = new Map(ordered.map((session) => [session.id, session]))
  const children = new Map<string, AgentSession[]>()
  const roots: AgentSession[] = []

  for (const session of ordered) {
    const parentId = session.forkedFromSessionId
    if (!parentId || parentId === session.id || !byId.has(parentId)) {
      roots.push(session)
      continue
    }
    const siblings = children.get(parentId) ?? []
    siblings.push(session)
    children.set(parentId, siblings)
  }

  const rows: AgentTaskBranchRow[] = []
  const visited = new Set<string>()
  const visit = (session: AgentSession, depth: number) => {
    if (visited.has(session.id)) return
    visited.add(session.id)
    const descendants = children.get(session.id) ?? []
    rows.push({ session, depth, childCount: descendants.length })
    for (const child of descendants) visit(child, depth + 1)
  }

  for (const root of roots) visit(root, 0)
  for (const session of ordered) visit(session, 0)
  return rows
}
