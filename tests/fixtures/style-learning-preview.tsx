import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StyleLearningDialog from '../../src/features/studio/components/StyleLearningDialog'
import type { StyleLearningWorkspace } from '../../shared/contracts/style-learning'
import '../../src/index.css'

// Local browser fixture: synthetic samples, no backend/model traffic or customer data.
const state: StyleLearningWorkspace = { privateStyleEnabled: true, samples: [{ id: 'sample', sourceId: 'source', name: '短剧对白与场景样章', createdAt: '2026-09-11T12:00:00Z', files: [{ name: '原创短剧示例.md', chars: 6500 }], canLearn: true, chars: 6500 }], jobs: [{ id: 'job', profileId: 'sample', status: 'ready', revision: 3, enabled: false, processed: 2, total: 2, pauseRequested: false, modelLabel: '本地模拟模型', rules: [{ dimension: '对白', rule: '角色用简短对白推动行动，避免替读者解释动机。', evidence: '甲：走。乙：等等。' }, { dimension: '场景与格式', rule: '用场次、地点和时间标记切换场景，动作独立成行。', evidence: '场1 / 走廊 / 夜' }], reports: [{ chunk: 1, rules: [{ dimension: '对白', rule: '短对白推进动作。', evidence: '甲：走。' }] }, { chunk: 2, rules: [{ dimension: '场景与格式', rule: '场景标题独立成行。', evidence: '场1 / 走廊 / 夜' }] }], error: null, updatedAt: '2026-09-11T12:00:00Z' }] }
window.fetch = async (input, init) => {
  const url = String(input)
  let data: unknown
  if (url.includes('/credits/summary')) data = { models: [{ tier: 'speed', label: '极速（模拟）', available: true, reasoningEfforts: ['high'], defaultReasoningEffort: 'high' }] }
  else if (url.includes('/credits/models')) data = { models: [] }
  else if (url.includes('/style-learning/samples/')) data = { exact: true, files: [{ name: '原创短剧示例.md', content: '场1 / 走廊 / 夜\n甲：走。乙：等等。\n'.repeat(80) }] }
  else if (url.includes('/style-learning/job') && init?.method === 'PATCH') { const body = JSON.parse(String(init.body)); state.jobs[0].enabled = body.action === 'enable'; state.jobs[0].rules = body.rules ?? state.jobs[0].rules; state.jobs[0].revision++; data = state.jobs[0] }
  else if (url.endsWith('/style-learning')) data = state
  else return new Response(JSON.stringify({ success: false, error: { message: '本地界面夹具不调用真实接口' } }), { status: 400 })
  return new Response(JSON.stringify({ success: true, data }), { headers: { 'content-type': 'application/json' } })
}
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).has('dark'))
export function Preview() { const [open, setOpen] = useState(true); return <div className="studio-workspace min-h-screen bg-[var(--surface-default)] p-8"><button onClick={() => setOpen(true)}>打开样章学习（本地夹具）</button>{open ? <StyleLearningDialog novelId="fixture" initialModel={{ modelTier: 'speed', customModelId: null, reasoningEffort: 'high' }} onClose={() => setOpen(false)} /> : null}</div> }
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><Preview /></QueryClientProvider>)
