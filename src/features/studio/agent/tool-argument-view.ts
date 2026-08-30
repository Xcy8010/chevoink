import type { AgentToolDisplayPayload } from '../../../../shared/contracts/index.js'

export type ToolArgumentRow = { label: string; value: string }

const ARGUMENT_LABELS: Record<string, string> = {
  title: '名称',
  chapterId: '目标章节',
  planId: '目标计划',
  volumeId: '目标卷',
  content: '正文内容',
  newText: '替换内容',
  oldText: '原文片段',
  text: '文本',
  markdown: '计划正文',
  query: '查找内容',
  replacement: '替换为',
  reason: '修改原因',
  position: '全书位置',
  positionInVolume: '卷内位置',
  volumeOrder: '卷序',
  start: '起始位置',
  end: '结束位置',
  fields: '修改范围',
  caseSensitive: '区分大小写',
  preserveQuotedText: '保留引号内文本',
  selectedPatchIds: '选中补丁',
  changeSetId: '变更集',
  compilationId: '编译任务',
}

const LONG_TEXT_KEYS = new Set(['content', 'newText', 'oldText', 'text', 'markdown'])

function formatValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (LONG_TEXT_KEYS.has(key)) {
      const preview = normalized.replace(/\s+/g, ' ').slice(0, 72)
      return `${normalized.length} 字${preview ? ` · ${preview}${normalized.length > 72 ? '…' : ''}` : ''}`
    }
    return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, 5).map((item) => typeof item === 'string' || typeof item === 'number' ? String(item) : '结构项')
    return `${value.length} 项${visible.length ? ` · ${visible.join('、')}${value.length > visible.length ? '…' : ''}` : ''}`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, nested]) => nested !== null && nested !== undefined)
    const visible = entries.slice(0, 4).map(([nestedKey, nested]) => `${ARGUMENT_LABELS[nestedKey] ?? nestedKey}：${formatValue(nestedKey, nested)}`)
    return `${entries.length} 个字段${visible.length ? ` · ${visible.join('；')}` : ''}`
  }
  return '未提供'
}

export function describeToolArguments(args: unknown): ToolArgumentRow[] {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return []
  return Object.entries(args as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ label: ARGUMENT_LABELS[key] ?? key, value: formatValue(key, value) }))
}

export function getToolTargetTitle(display: AgentToolDisplayPayload | undefined, args: unknown): string | null {
  if (display?.kind === 'chapterDiff') return display.chapterTitle
  if (display?.kind === 'chapterRef') return display.title
  if (display?.kind === 'planFile' || display?.kind === 'planDiff' || display?.kind === 'planRename' || display?.kind === 'planDelete') return display.title
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const record = args as Record<string, unknown>
    const title = record.title
    const hasTargetId = typeof record.chapterId === 'string' || typeof record.planId === 'string'
    if (hasTargetId && typeof title === 'string' && title.trim()) return title.trim()
  }
  return null
}
