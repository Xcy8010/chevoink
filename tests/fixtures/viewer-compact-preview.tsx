import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import StudioChapterViewer from '../../src/features/studio/components/StudioChapterViewer'
import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'
import '../../src/index.css'
const noop = () => undefined
export function Preview() {
  const [width, setWidth] = useState(220)
  const [action, setAction] = useState('尚未点击')
  return <main className="studio-workspace p-4">
    <label>查看器宽度<input aria-label="查看器宽度" type="range" min={180} max={720} value={width} onChange={event => setWidth(Number(event.target.value))} /></label><output>{width}px · {action}</output>
    <div className="flex flex-wrap gap-4">
      <div style={{ width, height: 440 }} className="max-w-full border"><StudioChapterViewer draft={null} workspaceDocument={{ id: 'catalog', kind: 'catalog', title: '《布衣山河》目录', description: '目录预览', content: '第一卷 边镇棋子\n\n第1章 黑石堡夜警', editableTitle: false, editableContent: false }} selection={{ text: '选中正文', start: 0, end: 4 }} onChange={noop} onSelectionChange={noop} onBlur={noop} onAddSelection={() => setAction('添加到输入框')} onCreateVolume={() => setAction('新建卷')} onCreateChapter={() => setAction('新建章节')} onClose={() => setAction('关闭')} /></div>
      <aside className="w-72 max-w-full self-start rounded-[20px] bg-[var(--surface-muted)] p-3"><h2>任务状态</h2><AgentActivityBar appearance="dock" activities={Array.from({ length: 19 }, (_, i) => ({ callId: String(i), toolName: 'chapter_write', label: `第${i + 1}章`, chapterId: `c${i}`, before: '', after: '章节正文', deltaChars: 4, status: 'done' as const }))} activitiesVersion={0} todos={[{ content: '编写章节', status: 'completed' }]} todosVersion={0} runActive={false} pendingReviewCount={0} reviewBusy={false} /></aside>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
