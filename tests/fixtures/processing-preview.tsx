import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import type { AgentMessagePart, AgentUIMessage } from '../../shared/contracts'
import { AgentMessageParts } from '../../src/features/studio/agent/components/AgentMessageParts'
import { ProcessingHint } from '../../src/features/studio/agent/components/ProcessingHint'
import { shouldShowProcessingHint } from '../../src/features/studio/agent/lib/panel-helpers'
import '../../src/index.css'
export function Preview() {
  const [stage, setStage] = useState('参数准备')
  const phase = stage === '暂停' ? 'paused' : stage === '完成' ? 'succeeded' : stage === '等待确认' ? 'awaiting_approval' : 'running'
  const parts: AgentMessagePart[] = stage === '思考'
    ? [{ type: 'reasoning', text: '正在分析场景任务。' }]
    : [{ type: 'text', text: '编译桥已建立。开始构建本章场景任务。' }, ...(stage === '工具执行' || stage === '工具间等待' ? [{ type: 'tool-call' as const, callId: 'c', toolName: 'scene_task_build', title: '构建场景任务', args: {}, status: stage === '工具执行' ? 'running' as const : 'success' as const, summary: stage === '工具间等待' ? '建立 3 个场景任务' : undefined }] : [])]
  const messages: AgentUIMessage[] = [{ id: 'm', runId: 'r', role: 'assistant', parts, createdAt: '2026-09-05T00:00:00Z' }]
  return <main className="studio-workspace mx-auto min-h-screen max-w-3xl p-6 text-[var(--text-primary)]">
    <nav className="mb-8 flex flex-wrap gap-3">{['参数准备', '思考', '工具执行', '工具间等待', '等待确认', '暂停', '完成'].map(item => <button key={item} onClick={() => setStage(item)}>{item}</button>)}</nav>
    <p className="mb-6">当前阶段：{stage}（模拟事件）</p>
    <AgentMessageParts parts={parts} streaming={phase === 'running'} runActive={phase === 'running'} />
    <div className="mt-4"><ProcessingHint visible={shouldShowProcessingHint(messages, 'r', phase, [])} /></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
