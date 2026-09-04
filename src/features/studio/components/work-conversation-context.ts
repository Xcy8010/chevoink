import { createContext, useContext } from 'react'

export const WorkConversationContext = createContext({ collapsed: false, expand: () => {} })
export const useWorkConversation = () => useContext(WorkConversationContext)
