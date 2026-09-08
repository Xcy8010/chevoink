import type { AgentUIMessage } from '../../../../../shared/contracts/index.js'
import { getMessageText } from './panel-helpers'

export type MessageBlock = { firstId: string; lastId: string; ops: number }

/** Pure presentation projection: never mutates messages or changes run state. */
export function projectMessages(messages: readonly AgentUIMessage[]) {
  const blockInfoById = new Map<string, MessageBlock>()
  let ids: string[] = []
  let ops = 0
  let recentConversationText = ''
  let lastAssistantId: string | undefined
  const flush = () => {
    if (ids.length === 0) return
    const block = { firstId: ids[0], lastId: ids[ids.length - 1], ops }
    for (const id of ids) blockInfoById.set(id, block)
    ids = []
    ops = 0
  }
  for (const message of messages) {
    if (message.role === 'assistant') {
      ids.push(message.id)
      lastAssistantId = message.id
      for (const part of message.parts) if (part.type !== 'text') ops++
    } else {
      flush()
    }
  }
  flush()
  for (let index = messages.length - 1; index >= 0; index--) {
    const text = getMessageText(messages[index].parts).replace(/\s+/g, ' ').trim()
    if (text) {
      recentConversationText = text.slice(0, 1000)
      break
    }
  }
  return { blockInfoById, recentConversationText, lastAssistantId }
}
