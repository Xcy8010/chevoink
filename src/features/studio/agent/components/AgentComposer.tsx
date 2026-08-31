import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { ArrowUp, BookOpenText, BrainCircuit, ChevronDown, ChevronRight, Eye, FileText, Image, LoaderCircle, Plus, Settings2, Square, X } from 'lucide-react'

import {
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_IMAGE_COUNT,
  type AgentAttachmentMeta,
} from '../../../../../shared/contracts/agent-attachments.js'
import type {
  CreditModelOption,
  CreditModelTier,
  CustomModelView,
  CreativeFreedom,
  ModelReasoningEffort,
  StoryCompilerMode,
} from '../../../../../shared/contracts/index.js'
import { prepareAgentImage, readFileAsDataUrl, validateAgentFile } from '../agent-attachments'
import { uploadAgentAttachment } from '../agentApi'
import { getChapterContent } from '../../api'
import { useAgentStore, type ComposerReference } from '../agentStore'
import {
  buildComposerPrompt,
  COMPOSER_REFERENCE_MIME,
  formatReferenceLineLabel,
  parseComposerReferenceTransfer,
  referenceKindLabel,
} from '../composer-content'

/**
 * Agent 输入区：
 * - Agent 默认最大权限（无模式切换），Enter 发送、Shift+Enter 换行；运行中主按钮切换为停止
 * - 图片（≤6 张）/文件（≤3 个）附件按钮：选件即传，预览可删，随提示词发送
 */

function formatAttachmentSize(size?: number): string {
  if (!size || size <= 0) {
    return ''
  }
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`
}

type AgentComposerProps = {
  novelId: string
  running: boolean
  disabled?: boolean
  /** 可返回 Promise：启动失败时抛错，输入框保留草稿与附件 */
  onSend: (prompt: string, attachments: AgentAttachmentMeta[], creativeFreedom: CreativeFreedom, qualityMode: StoryCompilerMode) => Promise<void> | void
  onStop: () => void
  creativeFreedom: CreativeFreedom
  onCreativeFreedomChange: (value: CreativeFreedom) => void
  qualityMode: StoryCompilerMode
  modelTier: CreditModelTier
  modelOptions: CreditModelOption[]
  onModelTierChange: (value: CreditModelTier) => void
  customModels: CustomModelView[]
  customModelId: string | null
  onCustomModelChange: (modelId: string) => void
  reasoningSelections: Record<string, ModelReasoningEffort>
  onReasoningEffortChange: (modelKey: string, effort: ModelReasoningEffort) => void
  onOpenModelSettings: () => void
  referenceOptions: Array<Omit<ComposerReference, 'offset'>>
}

type ParsedComposerContent = {
  draft: string
  references: ComposerReference[]
}

const CREATIVE_MODES: Array<{ value: CreativeFreedom; label: string; description: string }> = [
  { value: 'stable', label: '平衡延续', description: '贴合既有走向，适合续写与轻量调整。' },
  { value: 'balanced', label: '严谨创作', description: '默认；强化因果与人类感，并自动落实检查建议。' },
  { value: 'bold', label: '大胆探索', description: '适合试新场景和新结构，报告只提示不自动改写。' },
]

function ReasoningEffortControl({
  modelKey,
  efforts,
  selected,
  disabled,
  onChange,
}: {
  modelKey: string
  efforts: ModelReasoningEffort[]
  selected: ModelReasoningEffort
  disabled?: boolean
  onChange: (modelKey: string, effort: ModelReasoningEffort) => void
}) {
  if (efforts.length === 0) return null
  return <details className="group/effort relative mr-2 shrink-0" onClick={(event) => event.stopPropagation()}>
    <summary
      className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-[6px] px-1.5 text-[9px] text-[var(--text-tertiary)] opacity-0 transition-[opacity,color,background] hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)] group-hover:opacity-100 group-open/effort:opacity-100 [&::-webkit-details-marker]:hidden"
      title="调整这个模型的推理强度"
      aria-label={`推理强度 ${selected}`}
      onClick={(event) => { if (disabled) event.preventDefault() }}
    >
      <BrainCircuit className="h-3 w-3" />{selected}
    </summary>
    <div className="absolute bottom-0 left-[calc(100%+6px)] z-[60] w-28 overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
      {efforts.map((effort) => <button
        key={effort}
        type="button"
        className={`flex h-8 w-full items-center justify-between px-3 text-left text-xs hover:bg-[var(--surface-muted)] ${effort === selected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
        onClick={(event) => {
          onChange(modelKey, effort)
          event.currentTarget.closest('details')?.removeAttribute('open')
        }}
      ><span>{effort}</span>{effort === selected ? <span aria-hidden>✓</span> : null}</button>)}
    </div>
  </details>
}

function referenceLineLabel(reference: ComposerReference): string {
  return formatReferenceLineLabel(reference)
}

function composerSignature(draft: string, references: ComposerReference[]): string {
  return JSON.stringify({
    draft,
    references: references.map(({ id, offset }) => ({ id, offset })),
  })
}

function createReferenceNode(reference: ComposerReference): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.dataset.composerReference = reference.id
  chip.contentEditable = 'false'
  chip.title = `${reference.name} · 第 ${referenceLineLabel(reference)} 行`
  chip.className = 'group mx-0.5 inline-flex h-7 max-w-[min(18rem,75vw)] select-none items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 align-middle text-[11px] leading-none text-[var(--text-primary)]'

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.tabIndex = -1
  remove.dataset.removeComposerReference = reference.id
  remove.setAttribute('aria-label', `移除引用 ${reference.name}`)
  remove.className = 'mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]'

  const fileIcon = document.createElement('span')
  fileIcon.className = 'block text-[10px] font-semibold text-sky-500 group-hover:hidden'
  fileIcon.textContent = reference.kind === 'catalog' ? '目' : reference.kind === 'plan' ? '计' : '章'
  const removeIcon = document.createElement('span')
  removeIcon.className = 'hidden text-sm leading-none group-hover:block'
  removeIcon.textContent = '×'
  remove.append(fileIcon, removeIcon)

  const name = document.createElement('span')
  name.className = 'max-w-40 truncate'
  name.textContent = reference.name
  const lines = document.createElement('span')
  lines.className = 'ml-1 shrink-0 text-[var(--text-tertiary)]'
  lines.textContent = referenceLineLabel(reference)
  chip.setAttribute('aria-label', `${referenceKindLabel(reference)}引用：${reference.name}，第 ${referenceLineLabel(reference)} 行`)
  chip.append(remove, name, lines)
  return chip
}

function readComposerContent(root: HTMLDivElement, knownReferences: ComposerReference[]): ParsedComposerContent {
  const referenceMap = new Map(knownReferences.map((reference) => [reference.id, reference]))
  const references: ComposerReference[] = []
  let draft = ''
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      draft += node.textContent ?? ''
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    const referenceId = node.dataset.composerReference
    if (referenceId) {
      const reference = referenceMap.get(referenceId)
      if (reference) references.push({ ...reference, offset: draft.length })
      continue
    }
    if (node.tagName === 'BR') {
      draft += '\n'
      continue
    }
    draft += node.textContent ?? ''
  }
  return { draft, references }
}

function writeComposerContent(root: HTMLDivElement, draft: string, references: ComposerReference[]): void {
  root.replaceChildren()
  const ordered = [...references].sort((left, right) => left.offset - right.offset)
  let cursor = 0
  for (const reference of ordered) {
    const offset = Math.max(cursor, Math.min(draft.length, reference.offset))
    if (offset > cursor) root.append(document.createTextNode(draft.slice(cursor, offset)))
    root.append(createReferenceNode(reference))
    cursor = offset
  }
  if (cursor < draft.length) root.append(document.createTextNode(draft.slice(cursor)))
}

function insertPlainText(root: HTMLDivElement, value: string): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    root.append(document.createTextNode(value))
    return
  }
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const text = document.createTextNode(value)
  range.insertNode(text)
  range.setStartAfter(text)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function AgentComposer({
  novelId,
  running,
  disabled = false,
  onSend,
  onStop,
  creativeFreedom,
  onCreativeFreedomChange,
  qualityMode,
  modelTier,
  modelOptions,
  onModelTierChange,
  customModels,
  customModelId,
  onCustomModelChange,
  reasoningSelections,
  onReasoningEffortChange,
  onOpenModelSettings,
  referenceOptions,
}: AgentComposerProps) {
  // 草稿与附件存在全局 store：面板在沉浸/普通视图间重挂载时不丢失未发送内容
  const prompt = useAgentStore((state) => state.composerDraft)
  const attachments = useAgentStore((state) => state.composerAttachments)
  const setAttachments = useAgentStore((state) => state.setComposerAttachments)
  const addAttachment = useAgentStore((state) => state.addComposerAttachment)
  const removeAttachment = useAgentStore((state) => state.removeComposerAttachment)
  const references = useAgentStore((state) => state.composerReferences)
  const setComposerContent = useAgentStore((state) => state.setComposerContent)
  const addComposerReference = useAgentStore((state) => state.addComposerReference)
  const uploading = useAgentStore((state) => state.composerUploading)
  const bumpUploading = useAgentStore((state) => state.bumpComposerUploading)
  // 启动中（建会话 + 启动 run 的网络往返）：成功后才清空草稿，避免内容“瞬间消失”观感
  const [sending, setSending] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [referencePickerOpen, setReferencePickerOpen] = useState(false)
  const [referenceSearch, setReferenceSearch] = useState('')
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const creativeModeRef = useRef<HTMLDetailsElement | null>(null)
  const attachmentMenuRef = useRef<HTMLDetailsElement | null>(null)
  const modelMenuRef = useRef<HTMLDetailsElement | null>(null)

  const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length
  const fileCount = attachments.filter((attachment) => attachment.kind === 'file').length
  const imageFull = imageCount >= MAX_AGENT_IMAGE_COUNT
  const fileFull = fileCount >= MAX_AGENT_FILE_COUNT

  const canSend =
    !running && !disabled && !sending && uploading === 0 && (prompt.trim().length > 0 || references.length > 0)
  const activeBuiltInModel = modelOptions.find((item) => item.tier === modelTier)
  const activeCustomModel = modelTier === 'custom' ? customModels.find((item) => item.id === customModelId) : undefined
  const activeModelKey = modelTier === 'custom' && activeCustomModel ? `custom:${activeCustomModel.id}` : `tier:${modelTier}`
  const activeModelLabel = activeCustomModel?.displayName ?? activeBuiltInModel?.label ?? '极速'
  const activeReasoningEfforts = activeCustomModel?.reasoningEfforts ?? activeBuiltInModel?.reasoningEfforts ?? ['high']
  const storedActiveEffort = reasoningSelections[activeModelKey]
  const activeReasoningEffort = storedActiveEffort && activeReasoningEfforts.includes(storedActiveEffort)
    ? storedActiveEffort
    : activeCustomModel?.defaultReasoningEffort ?? activeBuiltInModel?.defaultReasoningEffort ?? 'high'
  const activeReasoningIndex = Math.max(0, activeReasoningEfforts.indexOf(activeReasoningEffort))

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const current = readComposerContent(editor, references)
    const domReferenceIds = Array.from(editor.querySelectorAll<HTMLElement>('[data-composer-reference]'))
      .map((node) => node.dataset.composerReference)
      .filter(Boolean)
    const desiredReferenceIds = references.map((reference) => reference.id)
    if (
      composerSignature(current.draft, current.references) !== composerSignature(prompt, references)
      || JSON.stringify(domReferenceIds) !== JSON.stringify(desiredReferenceIds)
    ) {
      writeComposerContent(editor, prompt, references)
    }
  }, [prompt, references])

  const syncComposerFromDom = (): ParsedComposerContent => {
    const editor = editorRef.current
    if (!editor) return { draft: prompt, references }
    const next = readComposerContent(editor, references)
    setComposerContent(next.draft, next.references)
    return next
  }

  const uploadOne = async (kind: 'image' | 'file', name: string, dataUrl: string) => {
    bumpUploading(1)
    try {
      const meta = await uploadAgentAttachment({ kind, name, dataUrl })
      addAttachment(meta)
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : '附件上传失败，请重试。')
    } finally {
      bumpUploading(-1)
    }
  }

  const processIncomingFiles = async (files: File[]) => {
    if (files.length === 0) return
    setAttachError(null)
    let remainingImages = MAX_AGENT_IMAGE_COUNT - imageCount
    let remainingFiles = MAX_AGENT_FILE_COUNT - fileCount
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        if (remainingImages <= 0) {
          setAttachError(`最多添加 ${MAX_AGENT_IMAGE_COUNT} 张参考图，超出的已忽略。`)
          continue
        }
        remainingImages -= 1
        try {
          const dataUrl = await prepareAgentImage(file)
          await uploadOne('image', file.name || `粘贴图片-${Date.now()}.png`, dataUrl)
        } catch (error) {
          setAttachError(error instanceof Error ? error.message : '图片处理失败，请重试。')
        }
        continue
      }

      if (remainingFiles <= 0) {
        setAttachError(`最多添加 ${MAX_AGENT_FILE_COUNT} 个文件，超出的已忽略。`)
        continue
      }
      const invalid = validateAgentFile(file)
      if (invalid) {
        setAttachError(invalid)
        continue
      }
      remainingFiles -= 1
      try {
        await uploadOne('file', file.name, await readFileAsDataUrl(file))
      } catch (error) {
        setAttachError(error instanceof Error ? error.message : '文件读取失败，请重试。')
      }
    }
  }

  const handlePickImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) {
      return
    }
    await processIncomingFiles(files)
  }

  const handlePickFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) {
      return
    }
    await processIncomingFiles(files)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (files.length > 0) {
      event.preventDefault()
      void processIncomingFiles(files)
      return
    }
    event.preventDefault()
    insertPlainText(event.currentTarget, event.clipboardData.getData('text/plain'))
    syncComposerFromDom()
  }

  const attachReference = async (input: Omit<ComposerReference, 'offset'>) => {
    let reference = input
    if (reference.kind === 'chapter' && !reference.text) {
      const chapterId = reference.id.replace(/^chapter:/, '')
      bumpUploading(1)
      try {
        const chapter = await getChapterContent(novelId, chapterId)
        reference = {
          ...reference,
          text: chapter.content,
          endLine: Math.max(1, chapter.content.split('\n').length),
        }
      } catch (error) {
        setAttachError(error instanceof Error ? error.message : '章节引用读取失败，请重试。')
        return
      } finally {
        bumpUploading(-1)
      }
    }
    addComposerReference({ ...reference, offset: prompt.length })
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const transferredReference = parseComposerReferenceTransfer(event.dataTransfer.getData(COMPOSER_REFERENCE_MIME))
    if (transferredReference) {
      await attachReference(transferredReference)
      return
    }
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) void processIncomingFiles(files)
  }

  const filteredReferenceOptions = referenceOptions.filter((reference) => {
    const keyword = referenceSearch.trim().toLocaleLowerCase('zh-CN')
    return !keyword || reference.name.toLocaleLowerCase('zh-CN').includes(keyword)
  })

  const handleSend = async () => {
    const current = syncComposerFromDom()
    if ((!current.draft.trim() && current.references.length === 0) || running || disabled || sending || uploading > 0) {
      return
    }
    const effectivePrompt = buildComposerPrompt(current.draft, current.references)
    const pending = attachments
    setSending(true)
    try {
      await onSend(effectivePrompt, pending, creativeFreedom, qualityMode)
      setComposerContent('', [])
      setAttachments([])
      setAttachError(null)
    } catch {
      // 面板已展示错误提示；保留草稿与附件供用户重试
    } finally {
      setSending(false)
      editorRef.current?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Backspace' && !prompt && references.length > 0) {
      event.preventDefault()
      setComposerContent('', references.slice(0, -1))
      return
    }
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      insertPlainText(event.currentTarget, '\n')
      syncComposerFromDom()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void handleSend()
    }
  }

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const removeButton = (event.target as HTMLElement).closest<HTMLElement>('[data-remove-composer-reference]')
    if (!removeButton) return
    event.preventDefault()
    removeButton.closest<HTMLElement>('[data-composer-reference]')?.remove()
    syncComposerFromDom()
    editorRef.current?.focus()
  }

  return (
    <div
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragActive(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }}
      onDrop={(event) => void handleDrop(event)}
      className={`relative rounded-[20px] border bg-[var(--surface-default)] p-2.5 shadow-sm transition-colors ${dragActive ? 'border-[var(--text-primary)]' : 'border-[var(--border-subtle)]'}`}
    >
      {dragActive ? <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[16px] bg-[var(--surface-default)]/95 text-xs font-medium text-[var(--text-primary)]">松开即可添加引用、图片或文件</div> : null}
      {(attachments.length > 0 || uploading > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
          {attachments.map((attachment) =>
            attachment.kind === 'image' ? (
              <div key={attachment.id} className="group relative h-14 w-14 shrink-0">
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="h-14 w-14 rounded-lg border border-[var(--border-subtle)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`移除图片 ${attachment.name}`}
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-contrast)] text-[var(--text-contrast)] opacity-85 transition-opacity hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                key={attachment.id}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-1.5 text-[11px] text-[var(--text-primary)]"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                <span className="max-w-32 truncate" title={attachment.name}>
                  {attachment.name}
                </span>
                <span className="shrink-0 text-[var(--text-secondary)]">
                  {formatAttachmentSize(attachment.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`移除文件 ${attachment.name}`}
                  className="shrink-0 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
          {uploading > 0 && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>
      )}
      {attachError && (
        <p className="mb-1.5 px-1 text-[11px] text-red-500">{attachError}</p>
      )}
      <div className="relative min-h-12">
        {!prompt && references.length === 0 ? (
          <span className="pointer-events-none absolute left-1.5 top-1 text-sm leading-6 text-[var(--text-secondary)]">
            告诉我要做什么，我会自主完成…
          </span>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-label="Agent 提示词"
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={syncComposerFromDom}
          onClick={handleEditorClick}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="max-h-40 min-h-12 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-1.5 py-1 text-sm leading-7 text-[var(--text-primary)] focus:outline-none data-[disabled=true]:opacity-50"
          data-disabled={disabled}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void handlePickImages(event)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            multiple
            className="hidden"
            onChange={(event) => void handlePickFiles(event)}
          />
          <details ref={attachmentMenuRef} className="group/attach relative" data-disabled={running || disabled || undefined}>
            <summary
              onClick={(event) => { if (running || disabled) event.preventDefault() }}
              className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] group-data-[disabled=true]/attach:pointer-events-none group-data-[disabled=true]/attach:opacity-40 [&::-webkit-details-marker]:hidden"
              aria-label="添加内容"
              title="添加图片、文件或作品引用"
            >
              <Plus className="h-4 w-4 transition-transform group-open/attach:rotate-45" />
            </summary>
            <div className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
              <button
                type="button"
                disabled={imageFull}
                onClick={() => { imageInputRef.current?.click(); attachmentMenuRef.current?.removeAttribute('open') }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40"
              >
                <Image className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span><span className="block font-medium">上传图片</span><span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">PNG、JPG、WebP，最多 6 张</span></span>
              </button>
              <button
                type="button"
                disabled={fileFull}
                onClick={() => { fileInputRef.current?.click(); attachmentMenuRef.current?.removeAttribute('open') }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40"
              >
                <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span><span className="block font-medium">上传文件</span><span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">PDF、DOCX、TXT、Markdown</span></span>
              </button>
              <div className="mx-3 my-1 border-t border-[var(--border-subtle)]" />
              <button
                type="button"
                onClick={() => setReferencePickerOpen((value) => !value)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
                aria-expanded={referencePickerOpen}
              >
                <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                <span className="min-w-0 flex-1"><span className="block font-medium text-[var(--text-primary)]">引用作品内容</span><span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">点选目录、计划或章节，也可从作品树拖入。</span></span>
                <ChevronDown className={`mt-0.5 h-3.5 w-3.5 transition-transform ${referencePickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {referencePickerOpen ? (
                <div className="border-t border-[var(--border-subtle)] px-2 pb-2 pt-2">
                  <input
                    value={referenceSearch}
                    onChange={(event) => setReferenceSearch(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder="搜索章节或计划"
                    className="h-8 w-full border border-[var(--border-subtle)] bg-[var(--surface-default)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)]"
                  />
                  <div className="mt-1 max-h-52 overflow-y-auto [scrollbar-width:thin]">
                    {filteredReferenceOptions.length > 0 ? filteredReferenceOptions.map((reference) => (
                      <button
                        key={reference.id}
                        type="button"
                        onClick={() => {
                          void attachReference(reference)
                          attachmentMenuRef.current?.removeAttribute('open')
                          setReferencePickerOpen(false)
                          setReferenceSearch('')
                        }}
                        className="flex w-full items-center gap-2 px-2 py-2 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                      >
                        <span className="w-6 shrink-0 text-[10px] text-[var(--text-tertiary)]">{reference.kind === 'chapter' ? '章节' : reference.kind === 'plan' ? '计划' : '目录'}</span>
                        <span className="min-w-0 flex-1 truncate">{reference.name}</span>
                      </button>
                    )) : <p className="px-2 py-4 text-center text-[11px] text-[var(--text-tertiary)]">没有匹配的作品内容</p>}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
          <details ref={creativeModeRef} className="group/mode relative" data-disabled={running || disabled || undefined}>
            <summary
              onClick={(event) => { if (running || disabled) event.preventDefault() }}
              aria-label="创作模式"
              title={CREATIVE_MODES.find((item) => item.value === creativeFreedom)?.description}
              className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] group-data-[disabled=true]/mode:pointer-events-none group-data-[disabled=true]/mode:opacity-45 [&::-webkit-details-marker]:hidden"
            >
              <span>{CREATIVE_MODES.find((item) => item.value === creativeFreedom)?.label}</span>
              <ChevronDown className="h-3 w-3 transition-transform group-open/mode:rotate-180" />
            </summary>
            <div className={`absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] shadow-[0_14px_34px_rgba(15,23,42,0.16)] ${creativeFreedom === 'bold' ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface-default)]'}`}>
              {CREATIVE_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.description}
                  onClick={() => {
                    onCreativeFreedomChange(mode.value)
                    creativeModeRef.current?.removeAttribute('open')
                  }}
                  aria-pressed={mode.value === creativeFreedom}
                  className={`block w-full px-3 py-2 text-left transition-colors first:rounded-t-[11px] last:rounded-b-[11px] ${mode.value === creativeFreedom ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface-default)] hover:bg-[var(--surface-muted)]'}`}
                >
                  <span className="block text-xs font-medium text-[var(--text-primary)]">{mode.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">{mode.description}</span>
                </button>
              ))}
            </div>
          </details>
          <details ref={modelMenuRef} className="group/model relative ml-auto" data-disabled={running || disabled || undefined}>
            <summary
              onClick={(event) => { if (running || disabled) event.preventDefault() }}
              aria-label="模型档位"
              title="选择模型性能与 Credits 倍率"
              className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-full px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] group-data-[disabled=true]/model:pointer-events-none group-data-[disabled=true]/model:opacity-45 [&::-webkit-details-marker]:hidden"
            >
              <span className="max-w-24 truncate">{activeModelLabel}</span>
              <span className="text-[9px] text-[var(--text-tertiary)]">{activeReasoningEffort}</span>
              <ChevronDown className="h-3 w-3 transition-transform group-open/model:rotate-180" />
            </summary>
            <div className="absolute bottom-full right-0 z-50 mb-2 w-[272px] overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.18)] motion-safe:origin-bottom-right motion-safe:animate-[agent-menu-in_150ms_cubic-bezier(0.2,0.8,0.2,1)]">
              <div className="px-2 pb-1">
                <div className="flex items-center justify-between rounded-[9px] px-2 py-2 text-xs"><span className="font-medium text-[var(--text-primary)]">模型</span><span className="max-w-36 truncate text-[var(--text-secondary)]">{activeModelLabel} <ChevronRight className="ml-1 inline h-3 w-3" /></span></div>
                <label className="flex items-center justify-between rounded-[9px] px-2 py-1 text-xs transition-colors hover:bg-[var(--surface-muted)]"><span className="font-medium text-[var(--text-primary)]">推理强度</span><span className="relative inline-flex items-center"><select value={activeReasoningEffort} onChange={(event) => onReasoningEffortChange(activeModelKey, event.target.value as ModelReasoningEffort)} className="h-8 cursor-pointer appearance-none bg-transparent py-1 pl-3 pr-6 text-right text-xs text-[var(--text-secondary)] outline-none" aria-label="推理强度">{activeReasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select><ChevronRight className="pointer-events-none absolute right-0 h-3 w-3 text-[var(--text-tertiary)]" /></span></label>
                <div className="flex items-center justify-between rounded-[9px] px-2 py-2 text-xs"><span className="font-medium text-[var(--text-primary)]">速度</span><span className="text-[var(--text-secondary)]">标准</span></div>
                <details className="group/advanced border-t border-[var(--border-subtle)] pt-1">
                  <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-[9px] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden"><span>高级</span><ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open/advanced:rotate-180" /></summary>
                  <div className="px-2 pb-2 pt-1">
                    <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/70 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]"><span>推理强度</span><span>{activeReasoningEffort}</span></div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, activeReasoningEfforts.length - 1)}
                        step={1}
                        value={activeReasoningIndex}
                        disabled={activeReasoningEfforts.length <= 1}
                        onChange={(event) => onReasoningEffortChange(activeModelKey, activeReasoningEfforts[Number(event.target.value)] ?? activeReasoningEffort)}
                        aria-label="调整当前模型推理强度"
                        className="agent-reasoning-slider h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ '--agent-slider-progress': `${activeReasoningEfforts.length <= 1 ? 100 : (activeReasoningIndex / (activeReasoningEfforts.length - 1)) * 100}%` } as CSSProperties}
                      />
                      <div className="mt-1 flex justify-between text-[9px] text-[var(--text-tertiary)]">{activeReasoningEfforts.map((effort) => <span key={effort}>{effort}</span>)}</div>
                    </div>
                  </div>
                </details>
              </div>
              <div className="mx-3 border-t border-[var(--border-subtle)]" />
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">内置模型</p>
              {modelOptions.map((option) => {
                const modelKey = `tier:${option.tier}`
                const savedEffort = reasoningSelections[modelKey]
                const selectedEffort = savedEffort && option.reasoningEfforts.includes(savedEffort) ? savedEffort : option.defaultReasoningEffort
                return <div key={option.tier} className={`group relative flex items-center transition-colors hover:bg-[var(--surface-muted)] ${option.tier === modelTier ? 'bg-[var(--surface-muted)]' : ''} ${!option.available ? 'opacity-40' : ''}`}>
                  <button
                    type="button"
                    disabled={!option.available}
                    onClick={() => {
                      onModelTierChange(option.tier)
                      modelMenuRef.current?.removeAttribute('open')
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">{option.label}{option.visionEnabled ? <Eye className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-label="支持图片" /> : null}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-tertiary)]">{option.multiplier.toFixed(1)}x{!option.available ? ' · 待配置' : ''}</span>
                  </button>
                  {option.available ? <ReasoningEffortControl modelKey={modelKey} efforts={option.reasoningEfforts} selected={selectedEffort} onChange={onReasoningEffortChange} /> : null}
                </div>
              })}
              {customModels.some((model) => model.enabled) ? <>
                <div className="mx-3 my-1 border-t border-[var(--border-subtle)]" />
                <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">自定义 · 自带密钥</p>
                {customModels.filter((model) => model.enabled).map((model) => {
                  const modelKey = `custom:${model.id}`
                  const savedEffort = reasoningSelections[modelKey]
                  const selectedEffort = savedEffort && model.reasoningEfforts.includes(savedEffort) ? savedEffort : model.defaultReasoningEffort
                  return <div key={model.id} className={`group relative flex items-center transition-colors hover:bg-[var(--surface-muted)] ${modelTier === 'custom' && model.id === customModelId ? 'bg-[var(--surface-muted)]' : ''}`}>
                    <button type="button" onClick={() => { onCustomModelChange(model.id); onModelTierChange('custom'); modelMenuRef.current?.removeAttribute('open') }} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left"><span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-[var(--text-primary)]">{model.displayName}{model.visionEnabled ? <Eye className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-label="支持图片" /> : null}</span><span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">BYOK</span></button>
                    <ReasoningEffortControl modelKey={modelKey} efforts={model.reasoningEfforts} selected={selectedEffort} onChange={onReasoningEffortChange} />
                  </div>
                })}
              </> : null}
              <div className="mx-3 my-1 border-t border-[var(--border-subtle)]" />
              <button
                type="button"
                onClick={() => { modelMenuRef.current?.removeAttribute('open'); onOpenModelSettings() }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
              >
                <Settings2 className="h-4 w-4 text-[var(--text-tertiary)]" /> 配置自定义模型
              </button>
            </div>
          </details>
        </div>
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-contrast)] text-[var(--text-contrast)] transition-opacity hover:opacity-85"
            aria-label="停止运行"
            title="停止运行"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-contrast)] text-[var(--text-contrast)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="发送"
            title="发送"
          >
            {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
