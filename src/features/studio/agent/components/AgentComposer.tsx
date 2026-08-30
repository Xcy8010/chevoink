import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { ArrowUp, ChevronDown, FileText, ImagePlus, LoaderCircle, Paperclip, Square, X } from 'lucide-react'

import {
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_IMAGE_COUNT,
  type AgentAttachmentMeta,
} from '../../../../../shared/contracts/agent-attachments.js'
import type { CreativeFreedom, StoryCompilerMode } from '../../../../../shared/contracts/index.js'
import { prepareAgentImage, readFileAsDataUrl, validateAgentFile } from '../agent-attachments'
import { uploadAgentAttachment } from '../agentApi'
import { useAgentStore, type ComposerReference } from '../agentStore'
import { buildComposerPrompt, formatReferenceLineLabel, referenceKindLabel } from '../composer-content'

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
  running: boolean
  disabled?: boolean
  /** 可返回 Promise：启动失败时抛错，输入框保留草稿与附件 */
  onSend: (prompt: string, attachments: AgentAttachmentMeta[], creativeFreedom: CreativeFreedom, qualityMode: StoryCompilerMode) => Promise<void> | void
  onStop: () => void
  creativeFreedom: CreativeFreedom
  onCreativeFreedomChange: (value: CreativeFreedom) => void
  qualityMode: StoryCompilerMode
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

export function AgentComposer({ running, disabled = false, onSend, onStop, creativeFreedom, onCreativeFreedomChange, qualityMode }: AgentComposerProps) {
  // 草稿与附件存在全局 store：面板在沉浸/普通视图间重挂载时不丢失未发送内容
  const prompt = useAgentStore((state) => state.composerDraft)
  const attachments = useAgentStore((state) => state.composerAttachments)
  const setAttachments = useAgentStore((state) => state.setComposerAttachments)
  const addAttachment = useAgentStore((state) => state.addComposerAttachment)
  const removeAttachment = useAgentStore((state) => state.removeComposerAttachment)
  const references = useAgentStore((state) => state.composerReferences)
  const setComposerContent = useAgentStore((state) => state.setComposerContent)
  const uploading = useAgentStore((state) => state.composerUploading)
  const bumpUploading = useAgentStore((state) => state.bumpComposerUploading)
  // 启动中（建会话 + 启动 run 的网络往返）：成功后才清空草稿，避免内容“瞬间消失”观感
  const [sending, setSending] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const creativeModeRef = useRef<HTMLDetailsElement | null>(null)

  const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length
  const fileCount = attachments.filter((attachment) => attachment.kind === 'file').length
  const imageFull = imageCount >= MAX_AGENT_IMAGE_COUNT
  const fileFull = fileCount >= MAX_AGENT_FILE_COUNT

  const canSend =
    !running && !disabled && !sending && uploading === 0 && (prompt.trim().length > 0 || references.length > 0)

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

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) void processIncomingFiles(files)
  }

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
      onDrop={handleDrop}
      className={`relative rounded-[20px] border bg-[var(--surface-default)] p-2.5 shadow-sm transition-colors ${dragActive ? 'border-[var(--text-primary)]' : 'border-[var(--border-subtle)]'}`}
    >
      {dragActive ? <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[16px] bg-[var(--surface-default)]/95 text-xs font-medium text-[var(--text-primary)]">松开即可添加图片或文件</div> : null}
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
        <div className="flex shrink-0 items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={running || disabled || imageFull}
            title={imageFull ? `最多添加 ${MAX_AGENT_IMAGE_COUNT} 张参考图` : '添加参考图（最多 6 张）'}
            aria-label="添加参考图"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
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
            <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
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
                  className={`block w-full px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)] ${mode.value === creativeFreedom ? 'bg-[var(--surface-muted)]' : ''}`}
                >
                  <span className="block text-xs font-medium text-[var(--text-primary)]">{mode.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[var(--text-tertiary)]">{mode.description}</span>
                </button>
              ))}
            </div>
          </details>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={running || disabled || fileFull}
            title={fileFull ? `最多添加 ${MAX_AGENT_FILE_COUNT} 个文件` : '添加文件（pdf/docx/txt/md，最多 3 个）'}
            aria-label="添加文件"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Paperclip className="h-4 w-4" />
          </button>
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
