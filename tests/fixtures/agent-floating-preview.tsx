import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../../src/components/ui/Toast'
import { WorkConversationContext } from '../../src/features/studio/components/work-conversation-context'
import { AgentPanel } from '../../src/features/studio/agent/components/AgentPanel'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'
import '../../src/index.css'

// Synthetic local-only history. No server tasks or author content are used.
useAgentStore.setState({ loadedSessionId: 'preview', messages: Array.from({ length: 16 }, (_, index) => ({
  id: `preview-${index}`, runId: `run-${Math.floor(index / 2)}`, role: index % 2 ? 'assistant' : 'user', createdAt: new Date().toISOString(),
  parts: [{ type: 'text', text: index % 2 ? '这是一段用于布局验证的示例回复。消息与输入框保持同宽，滚动时从悬浮控件后方经过。\n\n'.repeat(5) : '请继续整理这份示例计划。'.repeat(6) }],
})), todos: [{ id: 'todo', content: '示例待办', status: 'pending' }], workspaceActivities: [{callId:'change',toolName:'chapter_write',label:'示例章节',chapterId:'chapter',before:'',after:'示例正文',status:'done'}] })
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).has('dark'))
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ToastProvider><WorkConversationContext.Provider value={{collapsed:new URLSearchParams(location.search).has('compact'),expand:()=>location.assign(location.pathname)}}><div className="studio-workspace" style={{height:'100dvh',background:'var(--surface-default)'}}><AgentPanel sessionId="preview" novelId="preview" novelName="本地布局示例" taskTitle="悬浮输入区验证" ensureSession={async () => 'preview'} pendingReviewCount={1} /></div></WorkConversationContext.Provider></ToastProvider></QueryClientProvider>)
