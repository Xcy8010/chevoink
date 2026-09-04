import type { AgentStreamEvent, AgentStreamEventBody } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'

/**
 * run 级事件总线：发射 + 持久化 + SSE 桥接（plan/13 §4.6）。
 * - 所有事件按 seq 自增，写入 AgentRunEvent（replay/重连数据源）
 * - live 订阅者实时收到事件；重连用 Last-Event-ID 从 seq+1 续传
 * - 持久化走批量队列，避免 text.delta 高频事件逐条写库
 */

type EventListener = (event: AgentStreamEvent) => void

export class RunEventBus {
  readonly runId: string
  private seq = 0
  private history: AgentStreamEvent[] = []
  private listeners = new Set<EventListener>()
  private pendingPersist: AgentStreamEvent[] = []
  private flushing = false
  private closed = false

  constructor(runId: string) {
    this.runId = runId
  }

  emit(body: AgentStreamEventBody): AgentStreamEvent {
    if (this.closed) {
      throw new Error(`事件总线已关闭：${this.runId}`)
    }

    const event: AgentStreamEvent = {
      seq: ++this.seq,
      runId: this.runId,
      ts: new Date().toISOString(),
      ...body,
    }

    this.history.push(event)
    this.pendingPersist.push(event)
    void this.flush()

    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // 单个订阅者异常不影响其他订阅者
      }
    }

    return event
  }

  /**
   * 只面向当前 SSE 订阅者的高频预览事件。工具正文参数可能每几个 token 更新一次，
   * 不写 agent_run_events，避免把同一篇正文的所有中间副本反复落库；正式 tool.call/result 仍完整持久化。
   */
  emitTransient(body: AgentStreamEventBody): AgentStreamEvent {
    if (this.closed) throw new Error(`事件总线已关闭：${this.runId}`)
    const event: AgentStreamEvent = { seq: ++this.seq, runId: this.runId, ts: new Date().toISOString(), ...body }
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* 单个订阅者异常不影响其它订阅者 */ }
    }
    return event
  }

  /** 订阅事件：先补发 sinceSeq 之后的内存历史，再接 live 流 */
  subscribe(listener: EventListener, sinceSeq = 0): () => void {
    for (const event of this.history) {
      if (event.seq > sinceSeq) {
        try {
          listener(event)
        } catch {
          // 历史补发与 live 通知保持同一隔离语义：单个断开的 SSE
          // 响应不能阻止其他订阅者，也不能打断 Agent 运行。
        }
      }
    }

    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get lastSeq(): number {
    return this.seq
  }

  /** run 结束后调用：等待落库完成并释放内存 */
  async close(): Promise<void> {
    this.closed = true
    await this.flush()
    this.listeners.clear()
    this.history = []
  }

  private async flush(): Promise<void> {
    if (this.flushing) {
      return
    }

    this.flushing = true
    try {
      while (this.pendingPersist.length > 0) {
        const batch = this.pendingPersist.splice(0, this.pendingPersist.length)
        try {
          await prisma.agentRunEvent.createMany({
            data: batch.map((event) => ({
              runId: this.runId,
              seq: event.seq,
              type: event.type,
              payload: event as object,
            })),
            skipDuplicates: true,
          })
        } catch (error) {
          console.error('[agent-events] 事件持久化失败', this.runId, error)
        }
      }
    } finally {
      this.flushing = false
    }
  }
}

const busByRun = new Map<string, RunEventBus>()

export function createRunEventBus(runId: string): RunEventBus {
  const bus = new RunEventBus(runId)
  busByRun.set(runId, bus)
  return bus
}

export function getRunEventBus(runId: string): RunEventBus | undefined {
  return busByRun.get(runId)
}

export async function disposeRunEventBus(runId: string): Promise<void> {
  const bus = busByRun.get(runId)
  if (bus) {
    busByRun.delete(runId)
    await bus.close()
  }
}

/** run 已结束（无 live 总线）时，从 DB 读事件做 replay */
export async function loadPersistedEvents(runId: string, sinceSeq = 0): Promise<AgentStreamEvent[]> {
  const records = await prisma.agentRunEvent.findMany({
    where: { runId, seq: { gt: sinceSeq } },
    orderBy: { seq: 'asc' },
  })

  return records.map((record) => record.payload as unknown as AgentStreamEvent)
}
