import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AgentConversationRail } from '../../src/features/studio/components/AgentTaskSidebar'
import '../../src/index.css'

export function Preview() {
  const [dark, setDark] = useState(false)
  const conversations = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, userMessageId: `u${i}`, userText: `请继续完成第 ${i + 1} 章整改，检查人物动机和章节连续性。`, assistantText: `第 ${i + 1} 章正文与校验结果均已保存。这是脱敏模拟内容，仅用于轨道卡片裁剪回归。` }))
  return <main id="rail-fixture" style={{ height: '100vh', background: dark ? '#11151b' : '#fff', color: dark ? '#fff' : '#17212d', overflow: 'hidden' }}>
    <header className="flex h-12 gap-6 border-b p-3"><button onClick={() => setDark(value => !value)}>切换主题</button><button onClick={() => void document.getElementById('rail-fixture')?.requestFullscreen()}>全屏</button><span>轨道裁剪回归（模拟内容）</span></header>
    <div className="flex overflow-hidden" style={{ height: 'calc(100% - 48px)' }}>
      <aside className="h-full w-11 shrink-0 overflow-hidden"><AgentConversationRail conversations={conversations} onSelectConversation={() => undefined} /></aside>
      <section className="flex-1 p-6">将鼠标放在左侧轨道，卡片必须越过 44px 裁剪列完整显示。</section>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
