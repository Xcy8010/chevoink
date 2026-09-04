import { Download, LoaderCircle, Mic, Square, Trash2, X } from 'lucide-react'
import type { useVoiceInput } from '../hooks/useVoiceInput'
import { VOICE_MODEL_DOWNLOAD_BYTES } from '../voice/speech-engine'

export type AgentVoiceInputBarProps = {
  voice: ReturnType<typeof useVoiceInput>
  /** Pass the engine's formatted total download size; no model size is guessed here. */
  modelSizeLabel?: string
}

const roundButton = 'inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-subtle)] disabled:cursor-not-allowed disabled:opacity-40'

export function AgentVoiceInputBar({ voice, modelSizeLabel = `${Math.ceil(VOICE_MODEL_DOWNLOAD_BYTES / 1_000_000)} MB` }: AgentVoiceInputBarProps) {
  const { state: status, disabled } = voice
  const busy = ['checking', 'requesting-permission', 'transcribing', 'deleting'].includes(status)
  const showDownload = status === 'needs-download' || (status === 'error' && !voice.modelReady)
  const seconds = Math.min(60, Math.max(0, Math.floor(voice.elapsed)))
  const time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  const busyLabel = status === 'transcribing' ? '正在转写' : status === 'requesting-permission' ? '正在等待麦克风权限' : status === 'deleting' ? '正在删除语音包' : '正在检查语音包'

  return (
    <div className="w-full min-w-0 text-[var(--text-primary)]" aria-label="语音输入">
      {showDownload && (
        <p className="mb-2 px-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          首次使用需下载设备端语音包{modelSizeLabel ? `（约 ${modelSizeLabel}）` : ''}，建议连接 Wi-Fi。音频不离开设备，下载完成后点击麦克风开始录音。
        </p>
      )}
      {voice.error && <p role="alert" className="mb-2 break-words px-1 text-xs leading-relaxed text-[var(--text-secondary)]">{voice.error}</p>}
      <div className="flex min-h-11 w-full min-w-0 items-center gap-2">
        <button type="button" className={roundButton} aria-label="取消语音输入" title="取消语音输入" onClick={voice.cancel}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          {status === 'recording' ? (
            <>
              <div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden" role="img" aria-label="实时麦克风音量">
                {voice.levels.map((level, index) => (
                  <span key={index} data-level={level} className="w-0.5 shrink-0 rounded-full bg-current opacity-70" style={{ height: `${2 + Math.min(1, Math.max(0, level)) * 28}px` }} />
                ))}
              </div>
              <span className="shrink-0 text-sm tabular-nums" aria-label={`录音时间 ${time}，最多一分钟`}>{time}</span>
            </>
          ) : status === 'downloading' ? (
            <div className="min-w-0 flex-1 px-1">
              <div className="mb-1 flex justify-between gap-2 text-xs text-[var(--text-secondary)]"><span>正在下载语音包</span><span>{Math.round(voice.progress * 100)}%</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]" role="progressbar" aria-label="语音包下载进度" aria-valuenow={voice.progress} aria-valuemin={0} aria-valuemax={1}>
                <div className="h-full rounded-full bg-[var(--text-secondary)]" style={{ width: `${voice.progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <span role="status" className="text-center text-xs text-[var(--text-secondary)]">{busy ? busyLabel : showDownload ? '仅在此设备使用' : '录音只转为草稿，不会发送'}</span>
          )}
        </div>
        {status === 'recording' ? (
          <button type="button" className={`${roundButton} bg-[var(--surface-muted)]`} aria-label="停止录音并转写" title="停止录音并转写（不会发送）" onClick={() => void voice.stop()}>
            <Square size={16} fill="currentColor" aria-hidden="true" />
          </button>
        ) : busy || status === 'downloading' ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true"><LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" /></div>
        ) : showDownload ? (
          <button type="button" className={roundButton} disabled={disabled} aria-label="下载设备端语音包" onClick={() => void voice.download()}><Download size={20} aria-hidden="true" /></button>
        ) : (
          <button type="button" className={roundButton} disabled={disabled} aria-label="开始录音" onClick={() => void voice.start()}><Mic size={20} aria-hidden="true" /></button>
        )}
        {voice.modelReady && (status === 'idle' || status === 'error') && (
          <button type="button" className={roundButton} disabled={disabled} aria-label="删除设备端语音包" title="删除设备端语音包" onClick={() => void voice.removeModel()}><Trash2 size={18} aria-hidden="true" /></button>
        )}
      </div>
    </div>
  )
}
