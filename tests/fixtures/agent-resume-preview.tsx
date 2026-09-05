import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import { AgentMessageParts } from '../../src/features/studio/agent/components/AgentMessageParts'
import { ToastProvider } from '../../src/components/ui/Toast'
import '../../src/index.css'
const noop = () => undefined
export function Preview() {
  const [running, setRunning] = useState(false)
  const [starts, setStarts] = useState(0)
  return <ToastProvider><main className="studio-workspace mx-auto flex h-[100dvh] max-w-3xl flex-col p-4 text-[var(--text-primary)]">
    <header className="border-b pb-3">第19章 · 续跑测试（模拟内容）</header>
    <section className="flex-1 pt-5"><AgentMessageParts parts={[{ type: 'text', text: '重新发起场景构建，参数简化后继续。' }]} streaming runActive /><p className="mt-4 text-sm" role="status">{running ? '运行中' : '已暂停'} · 启动次数 {starts}</p></section>
    <AgentComposer novelId="preview" voiceScopeKey="resume-preview" running={running} onContinue={async () => { setStarts(v => v + 1); setRunning(true) }} onSend={() => setRunning(true)} onStop={() => setRunning(false)} creativeFreedom="balanced" onCreativeFreedomChange={noop} qualityMode="premium" modelTier="speed" modelOptions={[]} onModelTierChange={noop} customModels={[]} customModelId={null} onCustomModelChange={noop} reasoningSelections={{}} onReasoningEffortChange={noop} onOpenModelSettings={noop} referenceOptions={[]} />
  </main></ToastProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
