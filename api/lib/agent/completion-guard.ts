import type { AgentMessagePart, AgentTodoItem } from '../../../shared/contracts/index.js'

/** Only unambiguous continuation commands inherit the previous task. */
export function isContinuationRequest(prompt: string): boolean {
  return /^(?:请|请你|帮我)?\s*(?:继续|接着)(?:(?:执行|完成|处理)?(?:之前|此前|刚才|上次|上一轮|剩余|未完成)的?(?:任务|工作|整改|内容)?|执行|完成)?[。！!\s]*$/u.test(prompt.trim())
}

export function promisesFurtherAction(text: string): boolean {
  const lastSentence = text.trim().split(/[。！!\n]/u).filter(Boolean).at(-1) ?? ''
  if (/(?:无需|不需要|不必|如需|如果|你可以|您可以|可以继续|是否|已经|已完成)/u.test(lastSentence)) return false
  return /(?:接下来|下一步|现在|马上|先|继续|直接)(?:我会|我将|会|将|去)?[^。\n]{0,24}(?:写入|写正文|修订|修复|检查|校验|整改|重建|补齐|读取|读回)/u.test(lastSentence)
}

/** No-op diffs and repeated todo snapshots must not buy another budget slice. */
export function hasDurableProgress(part: Extract<AgentMessagePart, { type: 'tool-call' }>, previousTodos: AgentTodoItem[]): boolean {
  if (part.status !== 'success') return false
  const display = part.display
  if (display?.kind === 'chapterDiff') return display.appliedDirectly && display.before !== display.after
  if (display?.kind === 'planDiff') return display.before !== display.after
  if (display?.kind === 'todoList') {
    const completed = new Set(previousTodos.filter(item => item.status === 'completed').map(item => item.content))
    return display.items.some(item => item.status === 'completed' && !completed.has(item.content))
  }
  return display?.kind === 'planFile' || (part.toolName === 'chapter_create' && display?.kind === 'chapterRef')
}
