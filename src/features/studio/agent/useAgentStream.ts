import { useCallback, useEffect, useRef } from 'react'

import type { AgentStreamEvent } from '../../../../shared/contracts/index.js'
import { buildAgentStreamUrl } from './agentApi'
import { isRunActive, useAgentStore } from './agentStore'

/**
 * SSE 客户端（plan/13 §5.4）：
 * - 原生 EventSource：断线自动重连并自带 Last-Event-ID 续传
 * - 终态事件（run.finished / run.paused / 不可恢复 error）后手动关闭，避免无谓重连
 */

const EVENT_TYPES = [
  'run.started',
  'message.start',
  'text.delta',
  'reasoning.delta',
  'tool.call',
  'tool.delta',
  'tool.result',
  'permission.ask',
  'permission.resolved',
  'step.finish',
  'run.paused',
  'run.finished',
  'error',
] as const

function isTerminalEvent(event: AgentStreamEvent): boolean {
  return (
    event.type === 'run.finished' ||
    event.type === 'run.paused' ||
    (event.type === 'error' && !event.recoverable)
  )
}

export function useAgentStream(onEvent?: (event: AgentStreamEvent) => void) {
  const sourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const disconnect = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  }, [])

  const connect = useCallback(
    (runId: string, sinceSeq = 0) => {
      disconnect()

      const source = new EventSource(buildAgentStreamUrl(runId, sinceSeq), {
        withCredentials: true,
      })
      sourceRef.current = source

      const handleEvent = (raw: MessageEvent) => {
        if (!raw.data) {
          return
        }

        let event: AgentStreamEvent
        try {
          event = JSON.parse(raw.data) as AgentStreamEvent
        } catch {
          return
        }

        useAgentStore.getState().applyEvent(event)
        onEventRef.current?.(event)

        if (isTerminalEvent(event)) {
          disconnect()
        }
      }

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, handleEvent)
      }

      // 连接层错误（非业务 error 事件）：EventSource 自带重连 + Last-Event-ID，无需干预；
      // 仅在 run 已终结时主动关闭，避免死循环重连；等待回答/审批（awaiting_input/awaiting_approval）
      // 期间长时间无事件可能被代理掰断，必须保持重连才能收到后续事件
      source.onerror = () => {
        const { phase } = useAgentStore.getState()
        if (!isRunActive(phase)) {
          disconnect()
        }
      }
    },
    [disconnect],
  )

  useEffect(() => disconnect, [disconnect])

  return { connect, disconnect }
}
