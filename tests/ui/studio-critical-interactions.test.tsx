// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'
import { AgentConversationRail, type AgentConversationRailItem } from '../../src/features/studio/components/AgentTaskSidebar'
import LocalFirstTextarea from '../../src/features/studio/components/LocalFirstTextarea'
import type { CreditModelOption } from '../../shared/contracts/index.js'
import { ToastProvider } from '../../src/components/ui/Toast'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
})

afterEach(() => {
  cleanup()
  useAgentStore.setState({ composerDraft: '', composerAttachments: [], composerReferences: [] })
  vi.restoreAllMocks()
})

describe('创作区 P0 编辑稳定性', () => {
  it('本地输入提交回声不会把光标和滚动位置跳到正文底部', async () => {
    const onCommit = vi.fn()
    const initial = '第一段正文\n第二段正文\n第三段正文'
    const { rerender } = render(
      <LocalFirstTextarea value={initial} resetKey="chapter-1" onCommit={onCommit} commitDelay={10} aria-label="章节正文" />,
    )
    const editor = screen.getByRole('textbox', { name: '章节正文' }) as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(6, 6)
    editor.scrollTop = 88

    fireEvent.change(editor, { target: { value: '第一段正文新\n第二段正文\n第三段正文' } })
    // 浏览器在插入字符后把光标放到新字符之后；回归重点是外部提交回声不得把它移到文末。
    editor.setSelectionRange(7, 7)
    expect(editor.selectionStart).toBe(7)
    expect(editor.scrollTop).toBe(88)

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('第一段正文新\n第二段正文\n第三段正文'))
    const cursorAfterCommit = editor.selectionStart
    rerender(
      <LocalFirstTextarea value={editor.value} resetKey="chapter-1" onCommit={onCommit} commitDelay={10} aria-label="章节正文" />,
    )
    expect(editor.selectionStart).toBe(cursorAfterCommit)
    expect(editor.scrollTop).toBe(88)
  })

  it('切换章节时才按 resetKey 重置正文', async () => {
    const { rerender } = render(
      <LocalFirstTextarea value="第一章" resetKey="chapter-1" onCommit={() => undefined} aria-label="章节正文" />,
    )
    rerender(
      <LocalFirstTextarea value="第二章" resetKey="chapter-2" onCommit={() => undefined} aria-label="章节正文" />,
    )
    await waitFor(() => expect((screen.getByRole('textbox', { name: '章节正文' }) as HTMLTextAreaElement).value).toBe('第二章'))
  })
})

describe('Work 聊天轨道', () => {
  const conversations: AgentConversationRailItem[] = Array.from({ length: 48 }, (_, index) => ({
    id: `round-${index + 1}`,
    userMessageId: `user-${index + 1}`,
    userText: `用户第 ${index + 1} 轮提出的完整问题`,
    assistantText: `Agent 第 ${index + 1} 轮给出的完整回复`,
  }))

  it('居中、无容器底色与边框，最多展示 40 条且点击能导航到对应消息', async () => {
    const onSelect = vi.fn()
    render(<AgentConversationRail conversations={conversations} onSelectConversation={onSelect} />)

    const rail = screen.getByRole('navigation', { name: '当前任务聊天记录' })
    expect(rail.className).toContain('bg-transparent')
    expect(rail.className).not.toContain('border')
    expect(rail.firstElementChild?.className).toContain('justify-center')

    const markers = screen.getAllByRole('button', { name: /轮聊天/ })
    expect(markers).toHaveLength(40)
    expect(markers[0].getAttribute('aria-label')).toBe('第 9 轮聊天')
    expect(markers.at(-1)?.getAttribute('aria-label')).toBe('第 48 轮聊天')

    await userEvent.click(markers[0])
    expect(onSelect).toHaveBeenCalledWith('user-9')
  })

  it('悬停预览保留双方完整语义并以两行省略保护布局', async () => {
    render(<AgentConversationRail conversations={conversations.slice(-2)} onSelectConversation={() => undefined} />)
    const marker = screen.getByRole('button', { name: '第 2 轮聊天' })
    await userEvent.hover(marker)
    expect(screen.getByText('用户第 48 轮提出的完整问题').className).toContain('line-clamp-2')
    expect(screen.getByText('Agent 第 48 轮给出的完整回复').className).toContain('line-clamp-2')
    expect(screen.getByText('用户第 48 轮提出的完整问题').closest('[aria-hidden]')?.getAttribute('aria-hidden')).toBe('false')
  })
})

describe('Agent 模型与推理菜单', () => {
  const modelOptions: CreditModelOption[] = [{
    tier: 'speed',
    label: '极速',
    multiplier: 1,
    available: true,
    selectedByDefault: true,
    reasoningEfforts: ['low', 'high', 'max'],
    defaultReasoningEffort: 'high',
    visionEnabled: false,
  }]

  it('模型卡片保持最高交互层级，推理滑杆按当前模型支持档位切换', () => {
    const onReasoningEffortChange = vi.fn()
    render(<ToastProvider><AgentComposer
      novelId="novel-1"
      running={false}
      onSend={() => undefined}
      onStop={() => undefined}
      creativeFreedom="balanced"
      onCreativeFreedomChange={() => undefined}
      qualityMode="premium"
      modelTier="speed"
      modelOptions={modelOptions}
      onModelTierChange={() => undefined}
      customModels={[]}
      customModelId={null}
      onCustomModelChange={() => undefined}
      reasoningSelections={{ 'tier:speed': 'high' }}
      onReasoningEffortChange={onReasoningEffortChange}
      onOpenModelSettings={() => undefined}
      referenceOptions={[]}
    /></ToastProvider>)

    const modelSummary = screen.getByLabelText('模型档位')
    expect(modelSummary.closest('details')?.className).toContain('z-[120]')
    const slider = screen.getByRole('slider', { name: '调整当前模型推理强度' })
    fireEvent.change(slider, { target: { value: '2' } })
    expect(onReasoningEffortChange).toHaveBeenCalledWith('tier:speed', 'max')
  })
})
