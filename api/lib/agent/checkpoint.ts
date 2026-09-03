/**
 * plan/18 P4 检查点式自动续跑：纯函数判定 + 预算 clamp。
 *
 * 设计对照 codex（openai/codex）长任务架构：codex 靠「run 内 auto-compaction + 无预算出口 +
 * 进度外部化」连跑数小时；其缺陷见 issue #31351（compaction 后丢状态重复同一计划 → 再 compaction
 * → 无限循环烧掉 30% 配额）——codex 没有 compaction 计数与进展检测。
 *
 * 本项目取两者之长：预算/轮次耗尽不直接终止，而是做「检查点评估」；全部用确定性信号判定，
 * 满足则同 run 内压缩上下文 + 刷新预算片/轮次片继续跑；不满足走既有 wrap-up 收尾。
 * compaction 防 loop 专条 = 相邻两次压缩之间必须有真实写类进展（条件 b），否则禁止续跑。
 */

export interface CheckpointEvaluation {
  /** 当前未完成的待办数（0 = 任务已做完，无须续跑） */
  todoLeft: number
  /** 本 checkpoint 区间内成功的写类工具次数（chapter_write/append/edit_range、plan_save、memory_save 等） */
  writeProgress: number
  /** 上一个检查点时的写类进展基线（区间增量 = writeProgress - writeBaseline） */
  writeBaseline: number
  /** 已自动续跑次数 */
  resumeCount: number
  /** 已执行 compaction 次数 */
  compactionCount: number
  /** run 已运行的墙钟毫秒数 */
  elapsedMs: number
  /** 长任务墙钟帽毫秒数（默认 180 分钟） */
  longWallClockLimitMs: number
  maxResumes?: number
  maxCompactions?: number
}

export const CHECKPOINT_MAX_RESUMES = 4
export const CHECKPOINT_MAX_COMPACTIONS = 6
/** 每次续跑刷新的预算片：100 万 token；刷新时受硬顶 clamp，链总消耗封顶于硬顶（默认 500 万） */
export const CHECKPOINT_BUDGET_SLICE = 1_000_000
/** 每次续跑刷新的轮次片 */
export const CHECKPOINT_TURN_SLICE = 50

export function evaluateCheckpoint(input: CheckpointEvaluation): { ok: boolean; reason: string } {
  const maxResumes = input.maxResumes ?? CHECKPOINT_MAX_RESUMES
  const maxCompactions = input.maxCompactions ?? CHECKPOINT_MAX_COMPACTIONS
  // 条件 a：待办全部完成 = 任务做完，续跑没有意义
  if (input.todoLeft <= 0) return { ok: false, reason: '待办已全部完成' }
  // 条件 b（含 compaction 防 loop）：本区间内必须有真实写类进展，
  // 否则「压缩 → 丢失进展记忆 → 重复同一计划 → 再压缩」的 codex #31351 死循环会在本项目复现
  if (input.writeProgress <= input.writeBaseline) return { ok: false, reason: '本区间无新的写类进展' }
  // 条件 c：续跑链与 compaction 次数硬上限
  if (input.resumeCount >= maxResumes) return { ok: false, reason: `续跑次数已达上限 ${maxResumes}` }
  if (input.compactionCount >= maxCompactions) return { ok: false, reason: `压缩次数已达上限 ${maxCompactions}` }
  // 条件 d：墙钟总帽（长任务模式）未超
  if (input.elapsedMs > input.longWallClockLimitMs) return { ok: false, reason: '已达长任务墙钟总帽' }
  return { ok: true, reason: '' }
}

/**
 * run 预算解析：默认档不变（env 200 万）；作者显式上调时允许，但服务端 clamp 到硬顶（500 万），
 * 下调不限（最低 500 防空转误杀）。取代原「只能下调」的 min() 语义。
 */
export function resolveRunTokenBudget(paramBudget: number | undefined | null, defaultBudget: number, ceiling: number): number {
  const requested = paramBudget ?? defaultBudget
  return Math.min(ceiling, Math.max(500, requested))
}
