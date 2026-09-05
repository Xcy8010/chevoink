import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'
import '../../src/index.css'
export function Preview() {
  const [result, setResult] = useState('等待验收')
  const [empty, setEmpty] = useState(false)
  const [dock, setDock] = useState(false)
  const [busy, setBusy] = useState(false)
  return <main className="studio-workspace mx-auto flex h-[100dvh] max-w-3xl flex-col p-4 text-[var(--text-primary)]">
    <nav className="flex flex-wrap gap-3"><button onClick={() => setEmpty(v => !v)}>切换无变更</button><button onClick={() => setDock(v => !v)}>切换右侧栏</button><button onClick={() => setBusy(v => !v)}>切换忙碌</button></nav><output>{result}</output>
    <div className="flex-1" />
    <div className={dock ? 'ml-auto w-72 max-w-full rounded-2xl bg-[var(--surface-muted)] p-3' : ''}>
      <AgentActivityBar appearance={dock ? 'dock' : 'inline'} activities={empty ? [] : Array.from({ length: 19 }, (_, i) => ({ callId: String(i), toolName: 'chapter_write', label: `第${i + 1}章`, chapterId: `c${i}`, before: '', after: '章节正文', deltaChars: 4, status: 'done' as const }))} activitiesVersion={0} todos={[{ content: '编写章节', status: 'completed' }]} todosVersion={0} runActive={false} pendingReviewCount={2} reviewBusy={busy} onApproveAllReviews={() => setResult('接受回调')} onRejectAllReviews={() => setResult('拒绝回调')} />
    </div>
    <div className="mt-3 h-28 shrink-0 rounded-2xl border border-[var(--border-subtle)] p-4">输入框占位</div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
