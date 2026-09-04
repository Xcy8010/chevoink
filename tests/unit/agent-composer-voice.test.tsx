// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'

const voice = vi.hoisted(() => ({ options: undefined as undefined | { onTranscript: (text: string) => void }, state: 'idle', start: vi.fn(), cancel: vi.fn(), removeModel: vi.fn() }))
vi.mock('../../src/features/studio/agent/hooks/useVoiceInput', () => ({ useVoiceInput: (options: { onTranscript: (text: string) => void }) => {
  voice.options = options
  return { state: voice.state, disabled: false, modelReady: true, start: voice.start, cancel: voice.cancel, removeModel: voice.removeModel }
} }))
vi.mock('../../src/features/studio/agent/components/AgentVoiceInputBar', () => ({ AgentVoiceInputBar: () => <div>正在本机转写</div> }))

function props(): Parameters<typeof AgentComposer>[0] {
  return { novelId: 'n1', voiceScopeKey: 'u:n1:t1', running: false, onSend: vi.fn(), onStop: vi.fn(), creativeFreedom: 'balanced', onCreativeFreedomChange: vi.fn(), qualityMode: 'premium', modelTier: 'speed', modelOptions: [], onModelTierChange: vi.fn(), customModels: [], customModelId: null, onCustomModelChange: vi.fn(), reasoningSelections: {}, onReasoningEffortChange: vi.fn(), onOpenModelSettings: vi.fn(), referenceOptions: [] }
}

beforeEach(() => {
  voice.state = 'idle'
  vi.clearAllMocks()
  useAgentStore.setState({ composerDraft: '已有草稿', composerReferences: [], composerAttachments: [], composerUploading: 0, composerSkillIds: [] })
})
afterEach(cleanup)

describe('Agent voice draft integration', () => {
  it('only inserts a transcript into the draft and never sends', () => {
    const input = props()
    render(<AgentComposer {...input} />)
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    act(() => voice.options?.onTranscript('，续写下一章'))
    expect(useAgentStore.getState().composerDraft).toBe('已有草稿，续写下一章')
    expect(input.onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '撤销插入' }))
    expect(useAgentStore.getState().composerDraft).toBe('已有草稿')
  })
  it('does not overwrite concurrent edits and asks to append', () => {
    render(<AgentComposer {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    act(() => useAgentStore.setState({ composerDraft: '其他操作更新' }))
    act(() => voice.options?.onTranscript('语音'))
    expect(useAgentStore.getState().composerDraft).toBe('其他操作更新')
    fireEvent.click(screen.getByRole('button', { name: '插入到末尾' }))
    expect(useAgentStore.getState().composerDraft).toBe('其他操作更新语音')
  })
  it('ignores a result after changing task windows within the same novel', () => {
    const input = props()
    const { rerender } = render(<AgentComposer {...input} />)
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    rerender(<AgentComposer {...input} voiceScopeKey="u:n1:t2" />)
    act(() => voice.options?.onTranscript('上个窗口的录音'))
    expect(useAgentStore.getState().composerDraft).toBe('已有草稿')
  })
  it('locks editing and Enter sending while voice is active', () => {
    voice.state = 'transcribing'
    const input = props()
    render(<AgentComposer {...input} />)
    const editor = screen.getByRole('textbox', { name: 'Agent 提示词' })
    expect(editor.getAttribute('contenteditable')).toBe('false')
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(input.onSend).not.toHaveBeenCalled()
    expect(input.onStop).not.toHaveBeenCalled()
  })
  it('retains the draft when starting the Agent fails', async () => {
    const input = props()
    input.onSend = vi.fn().mockRejectedValue(new Error('offline'))
    render(<AgentComposer {...input} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '发送' })) })
    expect(useAgentStore.getState().composerDraft).toBe('已有草稿')
  })
})
