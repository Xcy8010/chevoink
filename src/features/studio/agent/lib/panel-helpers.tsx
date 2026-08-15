import type { AgentUIMessage } from '../../../../../shared/contracts/index.js'

/**
 * AgentPanel 的模块级纯声明（自 AgentPanel.tsx 抽取，逐字保留）：
 * 阶段文案映射、消息纯文本提取、会话时间格式化与助手输出判定。
 * 组件类声明（ProcessingHint）单独成文件，保持 react-refresh 快刷兼容。
 */

export const phaseLabel: Record<string, string> = {
  starting: '启动中',
  running: '运行中',
  awaiting_approval: '等待确认',
  awaiting_input: '等待回答',
  paused: '已暂停',
  succeeded: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

/** 提取消息纯文本（复制用） */
export function getMessageText(parts: AgentUIMessage['parts']): string {
  return parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function formatSessionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/** 当前 run 的助手消息是否已有输出（思考/动作/文本）：决定「正在处理...」占位的消失时机 */
export function assistantHasParts(messages: AgentUIMessage[], runId: string | null): boolean {
  if (!runId) {
    return false
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.runId === runId) {
      return message.parts.length > 0
    }
  }
  return false
}
