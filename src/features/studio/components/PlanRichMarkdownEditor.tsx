import { useEffect, useRef } from 'react'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { replaceAll } from '@milkdown/kit/utils'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'

import '@milkdown/crepe/theme/common/prosemirror.css'
import '@milkdown/crepe/theme/common/reset.css'
import '@milkdown/crepe/theme/common/placeholder.css'

import type { EditorSelectionState } from '../types'
import { useStreamingAutoFollow } from './useStreamingAutoFollow'

type Props = {
  markdown: string
  editable: boolean
  mobile: boolean
  onChange?: (markdown: string) => void
  onBlur?: () => void
  onSelectionChange?: (selection: EditorSelectionState) => void
  streaming?: boolean
}

export default function PlanRichMarkdownEditor({ markdown, editable, mobile, onChange, onBlur, onSelectionChange, streaming = false }: Props) {
  const streamingScroll = useStreamingAutoFollow<HTMLDivElement>(streaming, markdown)
  const rootRef = streamingScroll.nodeRef
  const editorRef = useRef<CrepeBuilder | null>(null)
  const currentMarkdownRef = useRef(markdown)
  const desiredMarkdownRef = useRef(markdown)
  const editableRef = useRef(editable)
  editableRef.current = editable
  const suppressedMarkdownRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  const onSelectionChangeRef = useRef(onSelectionChange)

  useEffect(() => {
    onChangeRef.current = onChange
    onBlurRef.current = onBlur
    onSelectionChangeRef.current = onSelectionChange
  }, [onBlur, onChange, onSelectionChange])

  desiredMarkdownRef.current = markdown

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let disposed = false
    let created = false
    let acceptingUpdates = false
    const editor = new CrepeBuilder({ root, defaultValue: markdown })
      .addFeature(placeholder, { text: '继续完善这份创作计划。', mode: 'block' })

    currentMarkdownRef.current = markdown
    editor.setReadonly(!editable)
    editor.on((listener) => {
      listener.markdownUpdated((_ctx, nextMarkdown, previousMarkdown) => {
        if (disposed) return
        currentMarkdownRef.current = nextMarkdown
        if (!acceptingUpdates) return
        if (suppressedMarkdownRef.current === nextMarkdown) {
          suppressedMarkdownRef.current = null
          return
        }
        if (nextMarkdown !== previousMarkdown) onChangeRef.current?.(nextMarkdown)
      })
      listener.blur(() => { if (!disposed) onBlurRef.current?.() })
    })

    void editor.create().then(() => {
      created = true
      if (disposed) {
        void editor.destroy()
        return
      }
      editorRef.current = editor
      editor.setReadonly(!editableRef.current)
      acceptingUpdates = true
      const desiredMarkdown = desiredMarkdownRef.current
      if (desiredMarkdown !== currentMarkdownRef.current) {
        suppressedMarkdownRef.current = desiredMarkdown
        currentMarkdownRef.current = desiredMarkdown
        synchronizeMarkdown(editor, desiredMarkdown)
      }
    })

    return () => {
      disposed = true
      if (editorRef.current === editor) editorRef.current = null
      if (created) void editor.destroy()
    }
    // 每份计划以独立组件实例挂载；外部内容变化由下方 replaceAll 增量同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || markdown === currentMarkdownRef.current) return
    suppressedMarkdownRef.current = markdown
    currentMarkdownRef.current = markdown
    synchronizeMarkdown(editor, markdown)
  }, [markdown])

  useEffect(() => {
    editorRef.current?.setReadonly(!editable)
  }, [editable])

  function emitVisualSelection() {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      onSelectionChangeRef.current?.({ start: 0, end: 0, text: '' })
      return
    }

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const text = selection.toString()
    const start = text ? currentMarkdownRef.current.indexOf(text) : -1
    onSelectionChangeRef.current?.({
      start: start >= 0 ? start : 0,
      end: start >= 0 ? start + text.length : text.length,
      text,
    })
  }

  return (
    <div
      ref={streamingScroll.ref}
      className={`plan-rich-markdown min-h-0 flex-1 ${mobile ? 'min-h-[60vh]' : 'overflow-y-auto'}`}
      onMouseUp={emitVisualSelection}
      onKeyUp={emitVisualSelection}
      onScroll={streamingScroll.onScroll}
      data-mobile={mobile ? 'true' : 'false'}
    />
  )
}

/** Equivalent serialized markdown must not replace the document and map the cursor. */
function synchronizeMarkdown(editor: CrepeBuilder, markdown: string) {
  editor.editor.action(ctx => {
    const next = ctx.get(parserCtx)(markdown)
    if (!next || ctx.get(editorViewCtx).state.doc.eq(next)) return
    replaceAll(markdown)(ctx)
  })
}
