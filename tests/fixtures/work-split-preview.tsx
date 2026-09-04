import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import WorkPerspective from '../../src/features/studio/components/WorkPerspective'
import { useWorkConversation } from '../../src/features/studio/components/work-conversation-context'
import { WorkConversationRestore } from '../../src/features/studio/components/WorkConversationRestore'
import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import { ToastProvider } from '../../src/components/ui/Toast'
import type { ModelReasoningEffort } from '../../shared/contracts/index'
import '../../src/index.css'
const noop = () => undefined
export function Conversation() {
  const { collapsed, expand } = useWorkConversation()
  const [reasoning, setReasoning] = useState<Record<string, ModelReasoningEffort>>({})
  return <div className={`relative flex h-full min-h-0 flex-col ${collapsed ? 'work-agent-compact' : ''}`}>
    <header className="p-4">历史架空小说构想 · 布衣山河</header>
    <div className="min-h-0 flex-1 overflow-auto p-4">{Array.from({ length: 12 }, (_, i) => <p key={i} className="mb-8">第 {i + 1} 章已完成。此处是交互测试内容，不会访问真实作品。</p>)}</div>
    {collapsed ? <WorkConversationRestore onExpand={expand} /> : null}
    <div data-agent-composer className="px-4 pb-4"><AgentComposer novelId="preview" voiceScopeKey="split-preview" running={false} onSend={noop} onStop={noop} creativeFreedom="balanced" onCreativeFreedomChange={noop} qualityMode="premium" modelTier="speed" modelOptions={[{ tier: 'speed', label: '极速', multiplier: 1, available: true, selectedByDefault: true, reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'high' }]} onModelTierChange={noop} customModels={[]} customModelId={null} onCustomModelChange={noop} reasoningSelections={reasoning} onReasoningEffortChange={(key, effort) => setReasoning(prev => ({ ...prev, [key]: effort }))} onOpenModelSettings={noop} referenceOptions={[]} /></div>
  </div>
}
export function Preview() {
  const [right, setRight] = useState(true)
  const [viewer, setViewer] = useState(true)
  return <ToastProvider><div className="studio-workspace text-[var(--text-primary)]" style={{ fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', height: '100vh', overflow: 'hidden' }}><div className="flex h-12 items-center gap-4 border-b px-4"><span>Work 布局交互测试（模拟内容）</span><button onClick={() => setViewer(v => !v)}>开关查看器</button></div><div style={{ height: 'calc(100% - 48px)' }}><WorkPerspective rightOpen={right} onToggleRight={() => setRight(v => !v)} inspectorTab="work" onSelectInspectorTab={noop} viewerIdentity={viewer ? 'chapter:1' : null} inspectorWidth={400} viewerWidth={600} conversationRail={<div className="p-3">☰</div>} conversation={<Conversation />} activityDock={<div className="rounded-2xl bg-[var(--surface-muted)] p-5">任务状态<br/>待办 5/5 已完成<br/>工作区变更 59 个变更</div>} inspector={<div className="p-4">作品 · 记忆 · 变更{Array.from({ length: 12 }, (_, i) => <p key={i} className="py-3">第{i + 1}章 · 北归</p>)}</div>} viewer={viewer ? <article className="h-full overflow-auto p-6"><h1>黑石堡夜警</h1>{Array.from({ length: 15 }, (_, i) => <p key={i} className="py-4 leading-8">三更的梆子敲过，风就变了向。陈砚贴着西墙根走，一步一步踏出声来。</p>)}</article> : undefined}/></div></div></ToastProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
