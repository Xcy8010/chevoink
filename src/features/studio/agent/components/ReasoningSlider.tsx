import type { CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import type { ModelReasoningEffort } from '../../../../../shared/contracts/index.js'

const labels: Record<ModelReasoningEffort, string> = { none: '关闭', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高' }

/** Native range semantics under a thick, animated visual track; shared by touch and desktop. */
export function ReasoningSlider({ efforts, value, modelLabel, defaultValue, onChange }: {
  efforts: ModelReasoningEffort[]; value: ModelReasoningEffort; modelLabel: string
  defaultValue?: ModelReasoningEffort; onChange: (value: ModelReasoningEffort) => void
}) {
  const index = Math.max(0, efforts.indexOf(value))
  const last = Math.max(0, efforts.length - 1)
  const position = last ? index / last : 0.5
  return <div className="reasoning-control">
    <div className="relative mb-2 flex min-h-11 items-center justify-center px-10 text-center">
      <div><p className="text-base font-semibold text-[var(--reasoning-accent,#3b82f6)]">{labels[value]}</p><p className="max-w-48 truncate text-xs text-[var(--text-secondary)]">{modelLabel}</p></div>
      {defaultValue && efforts.includes(defaultValue) ? <button type="button" aria-label="恢复默认推理强度" title="恢复默认推理强度" onClick={() => onChange(defaultValue)} disabled={value === defaultValue} className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] disabled:opacity-30"><RotateCcw className="h-4 w-4" /></button> : null}
    </div>
    <div className="reasoning-range" style={{ '--reasoning-position': position } as CSSProperties}>
      <div className="reasoning-track" aria-hidden="true" /><div className="reasoning-fill" aria-hidden="true" />
      {efforts.map((effort, i) => <span key={effort} className="reasoning-tick" aria-hidden="true" style={{ left: `calc(20px + (100% - 40px) * ${last ? i / last : 0.5})` }} />)}
      <span className="reasoning-thumb" aria-hidden="true" />
      <input type="range" min={0} max={last} step={1} value={index} disabled={last === 0} aria-label="调整当前模型推理强度" aria-valuetext={`${labels[value]} · ${modelLabel}`} onChange={event => onChange(efforts[Number(event.target.value)] ?? value)} />
    </div>
  </div>
}
