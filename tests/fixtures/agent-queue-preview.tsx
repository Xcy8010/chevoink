import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import { AgentQueueTray } from '../../src/features/studio/agent/components/AgentQueueTray'
import WorkspaceNovelSwitcher from '../../src/features/studio/components/WorkspaceNovelSwitcher'
import { WorkConversationRestore } from '../../src/features/studio/components/WorkConversationRestore'
import { ToastProvider } from '../../src/components/ui/Toast'
import type { AgentQueuedRequestView } from '../../shared/contracts/agent-queue'
import type { Novel } from '../../shared/contracts'
import '../../src/index.css'
const noop = () => undefined
export function Preview() {
  const [running, setRunning] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [items, setItems] = useState<AgentQueuedRequestView[]>([{ id: 'q', sessionId: 's', prompt: '继续执行：完成全部章节校验后，汇总尚未解决的问题并逐项修复', attachmentCount: 0, status: 'pending', revision: 0, error: null }])
  const [result, setResult] = useState('当前任务运行中（模拟数据）')
  const novels = [{ id: 'n', title: '布衣山河：一个长篇架空历史小说的完整作品标题', chapterCount: 19, wordCount: 65529 }, { id: 'n2', title: '未命名作品', chapterCount: 0, wordCount: 0 }] as Novel[]
  return <ToastProvider><main className="studio-workspace mx-auto flex h-[100dvh] max-w-3xl flex-col p-3 text-[var(--text-primary)]">
    <header className="flex gap-2"><div className="w-40"><WorkspaceNovelSwitcher fullWidth novels={novels} currentNovelId="n" currentNovelTitle="布衣山河" onSelectNovel={id => setResult(id)} onCreateNovel={noop} /></div><button onClick={() => setCollapsed(v => !v)}>切换折叠</button></header>
    <section className="min-h-0 flex-1 pt-5"><p role="status">{result}</p></section>
    <AgentQueueTray items={items} onAction={async (item, action, prompt) => {
      setResult(action)
      if (action === 'edit') setItems(rows => rows.map(row => row.id === item.id ? { ...row, prompt: prompt!, revision: row.revision + 1 } : row))
      else setItems(rows => rows.filter(row => row.id !== item.id))
    }} />
    {collapsed ? <WorkConversationRestore onExpand={() => setCollapsed(false)} recentMessage="当前任务最后一条对话" /> : null}
    <AgentComposer novelId="preview" voiceScopeKey="queue-preview" running={running} onSend={async prompt => { setItems(rows => [...rows, { ...items[0], id: crypto.randomUUID(), sessionId: 's', prompt, attachmentCount: 0, status: 'pending', revision: 0, error: null }]) }} onStop={() => setRunning(false)} creativeFreedom="balanced" onCreativeFreedomChange={noop} qualityMode="premium" modelTier="speed" modelOptions={[]} onModelTierChange={noop} customModels={[]} customModelId={null} onCustomModelChange={noop} reasoningSelections={{}} onReasoningEffortChange={noop} onOpenModelSettings={noop} referenceOptions={[]} />
  </main></ToastProvider>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
