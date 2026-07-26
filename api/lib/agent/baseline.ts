/**
 * Agent 写入基线：防止 Agent 写入与用户手动编辑冲突。
 * run 观察到章节内容时记录基线（updatedAt），写入前校验；
 * 基线不一致说明用户在 Agent 运行期间改过正文，转为 diff 审阅由用户裁决。
 */

const baselinesByRun = new Map<string, Map<string, string>>()

export function recordChapterBaseline(runId: string, chapterId: string, updatedAt: Date | string) {
  let baselines = baselinesByRun.get(runId)

  if (!baselines) {
    baselines = new Map()
    baselinesByRun.set(runId, baselines)
  }

  baselines.set(chapterId, typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString())
}

export function getChapterBaseline(runId: string, chapterId: string): string | null {
  return baselinesByRun.get(runId)?.get(chapterId) ?? null
}

export function clearRunBaselines(runId: string) {
  baselinesByRun.delete(runId)
}
