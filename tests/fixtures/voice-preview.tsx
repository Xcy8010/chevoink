import { createRoot } from 'react-dom/client'
import { AgentVoiceInputBar } from '../../src/features/studio/agent/components/AgentVoiceInputBar'
import { AgentComposer } from '../../src/features/studio/agent/components/AgentComposer'
import type { VoiceInputController, VoiceInputStatus } from '../../src/features/studio/agent/hooks/useVoiceInput'
import '../../src/index.css'

const noop = () => undefined
const asyncNoop = async () => undefined

function controller(state: VoiceInputStatus): VoiceInputController {
  return {
    state, status: state, active: state !== 'idle', modelReady: state !== 'needs-download', disabled: false,
    error: null, progress: 0.42, elapsed: 12,
    // Fixed synthetic amplitudes for layout QA, not microphone measurements.
    levels: [0, 0.1, 0.2, 0.4, 0.2, 0.1, 0, 0.1, 0.3, 0.8, 0.6, 0.2, 0.4, 0.7, 0.4, 0.2, 0, 0.2, 0.5, 0.8, 0.6, 0.2, 0.1, 0, 0.2, 0.5, 0.3, 0.1],
    start: asyncNoop, stop: asyncNoop, cancel: noop, download: asyncNoop, removeModel: asyncNoop, deleteModel: asyncNoop,
  }
}

createRoot(document.getElementById('root')!).render(
  <main className="mx-auto max-w-xl space-y-5 p-2 text-[var(--text-primary)]">
    <h1 className="text-sm">语音栏布局测试 · 固定模拟状态，不是实录</h1>
    <section aria-label="完整 Composer">
      <h2 className="mb-2 text-xs">完整 Composer 工具条</h2>
      <AgentComposer
        novelId="preview" voiceScopeKey="preview:user:novel:task" running={false}
        onSend={noop} onStop={noop} creativeFreedom="balanced" onCreativeFreedomChange={noop}
        qualityMode="premium" modelTier="speed" modelOptions={[{ tier: 'speed', label: '极速模型', multiplier: 1, available: true, selectedByDefault: true, reasoningEfforts: ['low'], defaultReasoningEffort: 'low', visionEnabled: false }]}
        onModelTierChange={noop} customModels={[]} customModelId={null} onCustomModelChange={noop}
        reasoningSelections={{}} onReasoningEffortChange={noop} onOpenModelSettings={noop} referenceOptions={[]}
      />
    </section>
    {(['recording', 'transcribing', 'needs-download', 'downloading'] as const).map((state) => (
      <section key={state} aria-label={state} className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2.5">
        <h2 className="mb-2 text-xs text-[var(--text-secondary)]">{state}</h2>
        <AgentVoiceInputBar voice={controller(state)} />
      </section>
    ))}
  </main>,
)
