/**
 * Agent 写入基线：防止 Agent 写入与用户手动编辑冲突。
 * run 观察到章节内容时记录基线（revision），写入前校验；
 * 基线不一致说明用户在 Agent 运行期间改过正文，转为 diff 审阅由用户裁决。
 */

const baselinesByRun = new Map<string, Map<string, number>>()

/** 本 run 最近一次读/写/新建的章节：供模型漏传 chapterId 时做兜底（比「当前打开章节」更贴近意图） */
const lastTouchedByRun = new Map<string, string>()

export function recordChapterBaseline(runId: string, chapterId: string, revision: number) {
  let baselines = baselinesByRun.get(runId)

  if (!baselines) {
    baselines = new Map()
    baselinesByRun.set(runId, baselines)
  }

  baselines.set(chapterId, revision)
  lastTouchedByRun.set(runId, chapterId)
}

export function getLastTouchedChapter(runId: string): string | null {
  return lastTouchedByRun.get(runId) ?? null
}

export function getChapterBaseline(runId: string, chapterId: string): number | null {
  return baselinesByRun.get(runId)?.get(chapterId) ?? null
}

export function clearRunBaselines(runId: string) {
  baselinesByRun.delete(runId)
  lastTouchedByRun.delete(runId)
}
