import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, FileText, ImagePlus, LoaderCircle, Paperclip, Square, X } from 'lucide-react'

import {
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_IMAGE_COUNT,
  type AgentAttachmentMeta,
} from '../../../../../shared/contracts/agent-attachments.js'
import type { CreativeFreedom } from '../../../../../shared/contracts/index.js'
import { prepareAgentImage, readFileAsDataUrl, validateAgentFile } from '../agent-attachments'
import { uploadAgentAttachment } from '../agentApi'
import { useAgentStore } from '../agentStore'

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
  onSend: (prompt: string, attachments: AgentAttachmentMeta[], creativeFreedom: CreativeFreedom) => Promise<void> | void
  onStop: () => void
  creativeFreedom: CreativeFreedom
  onCreativeFreedomChange: (value: CreativeFreedom) => void
}

export function AgentComposer({ running, disabled = false, onSend, onStop, creativeFreedom, onCreativeFreedomChange }: AgentComposerProps) {
  // 草稿与附件存在全局 store：面板在沉浸/普通视图间重挂载时不丢失未发送内容
  const prompt = useAgentStore((state) => state.composerDraft)
  const setPrompt = useAgentStore((state) => state.setComposerDraft)
  const attachments = useAgentStore((state) => state.composerAttachments)
  const setAttachments = useAgentStore((state) => state.setComposerAttachments)
  const addAttachment = useAgentStore((state) => state.addComposerAttachment)
  const removeAttachment = useAgentStore((state) => state.removeComposerAttachment)
  const references = useAgentStore((state) => state.composerReferences)
  const removeReference = useAgentStore((state) => state.removeComposerReference)
  const clearReferences = useAgentStore((state) => state.clearComposerReferences)
  const uploading = useAgentStore((state) => state.composerUploading)
  const bumpUploading = useAgentStore((state) => state.bumpComposerUploading)
  // 启动中（建会话 + 启动 run 的网络往返）：成功后才清空草稿，避免内容“瞬间消失”观感
  const [sending, setSending] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length
  const fileCount = attachments.filter((attachment) => attachment.kind === 'file').length
  const imageFull = imageCount >= MAX_AGENT_IMAGE_COUNT
  const fileFull = fileCount >= MAX_AGENT_FILE_COUNT

  const canSend =
    !running && !disabled && !sending && uploading === 0 && (prompt.trim().length > 0 || references.length > 0)

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

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    if (files.length === 0) return
    event.preventDefault()
    void processIncomingFiles(files)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) void processIncomingFiles(files)
  }

  const handleSend = async () => {
    const trimmed = prompt.trim()
    if ((!trimmed && references.length === 0) || running || disabled || sending || uploading > 0) {
      return
    }
    const referenceBlock = references
      .map((reference) => {
        const lineLabel = reference.startLine === reference.endLine
          ? `L${reference.startLine}`
          : `L${reference.startLine}-${reference.endLine}`
        return `[引用：${reference.name} ${lineLabel}]\n${reference.text}`
      })
      .join('\n\n')
    const effectivePrompt = [referenceBlock, trimmed].filter(Boolean).join('\n\n')
    const pending = attachments
    setSending(true)
    try {
      await onSend(effectivePrompt, pending, creativeFreedom)
      setPrompt('')
      setAttachments([])
      clearReferences()
      setAttachError(null)
    } catch {
      // 面板已展示错误提示；保留草稿与附件供用户重试
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' && !prompt && references.length > 0) {
      event.preventDefault()
      removeReference(references[references.length - 1].id)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void handleSend()
    }
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
      {(references.length > 0 || attachments.length > 0 || uploading > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
          {references.map((reference) => (
            <div
              key={reference.id}
              className="group flex h-7 shrink-0 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 text-[11px] text-[var(--text-primary)]"
              title={`${reference.name} · 第 ${reference.startLine}-${reference.endLine} 行`}
            >
              <button
                type="button"
                onClick={() => removeReference(reference.id)}
                aria-label={`移除引用 ${reference.name}`}
                className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]"
              >
                <FileText className="h-3.5 w-3.5 group-hover:hidden" />
                <X className="hidden h-3.5 w-3.5 group-hover:block" />
              </button>
              <span className="max-w-40 truncate">{reference.name}</span>
              <span className="ml-1 shrink-0 text-[var(--text-tertiary)]">
                {reference.startLine === reference.endLine ? reference.startLine : `${reference.startLine}-${reference.endLine}`}
              </span>
            </div>
          ))}
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
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={2}
        disabled={disabled}
        placeholder="告诉我要做什么，我会自主完成…"
        className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none disabled:opacity-50"
      />
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
          <select
            value={creativeFreedom}
            onChange={(event) => onCreativeFreedomChange(event.target.value as CreativeFreedom)}
            disabled={running || disabled}
            aria-label="创作自由度"
            title="创作自由度只影响软技巧与表达探索，不降低事实一致性"
            className="h-7 rounded-full border-0 bg-[var(--surface-muted)] px-2 text-[11px] text-[var(--text-secondary)] outline-none transition-colors hover:text-[var(--text-primary)] disabled:opacity-45"
          >
            <option value="stable">稳定延续</option>
            <option value="balanced">平衡创作</option>
            <option value="bold">大胆探索</option>
          </select>
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
