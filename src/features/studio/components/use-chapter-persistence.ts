import { useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import type { Novel, StudioPayload } from '../../../../shared/contracts/index.js'
import { createChapterDraft, updateChapterDraft } from '../api'
import { buildChapterDraft } from '../lib/form-state'
import { formatDateTime } from '../lib/agent-session'
import { replaceChapterItem, toChapterListItem } from '../lib/plan-review'
import type { ChapterDraftState, ChapterPendingReview, SaveState } from '../types'
import { registerDesktopSave } from '@/lib/desktop-lifecycle'

type ChapterPersistence = {
  activeNovelId: string
  chapterDraft: ChapterDraftState | null
  chapterDirty: boolean
  chapterDraftStateRef: MutableRefObject<ChapterDraftState | null>
  pendingChapterReviewsRef: MutableRefObject<ChapterPendingReview[]>
  selectedChapterIdStateRef: MutableRefObject<string | null>
  promptConfirmPendingChapterReview: (label: string) => void
  setChapterSaveState: Dispatch<SetStateAction<SaveState>>
  setChapterSaveMessage: Dispatch<SetStateAction<string>>
  setChapters: Dispatch<SetStateAction<StudioPayload['chapters']>>
  setSelectedTreeItemId: Dispatch<SetStateAction<string | null>>
  setSelectedChapterId: Dispatch<SetStateAction<string | null>>
  setChapterDraft: Dispatch<SetStateAction<ChapterDraftState | null>>
  setChapterDirty: Dispatch<SetStateAction<boolean>>
  setChapterLastSavedAt: Dispatch<SetStateAction<string | null>>
  setCurrentNovel: Dispatch<SetStateAction<Novel | null>>
  syncStudioPayload: (updater: (current: StudioPayload | undefined) => StudioPayload | undefined) => void
}

/** Serializes editor saves while preserving edits made during an in-flight request. */
export function useChapterPersistence(options: ChapterPersistence) {
  const latest = useRef(options)
  latest.current = options
  const epoch = useRef(0)
  const chapterSavingRef = useRef(false)
  const { activeNovelId, chapterDraft, chapterDirty, setChapterSaveState, setChapterSaveMessage } = options
  useLayoutEffect(() => {
    const owner = ++epoch.current
    chapterSavingRef.current = false
    return () => { epoch.current = owner + 1 }
  }, [activeNovelId])

  const persistChapter = useCallback(
    async (reason: 'manual' | 'auto' | 'apply') => {
      const { activeNovelId, chapterDraftStateRef, pendingChapterReviewsRef, selectedChapterIdStateRef, promptConfirmPendingChapterReview, setChapterSaveState, setChapterSaveMessage, setChapters, setSelectedTreeItemId, setSelectedChapterId, setChapterDraft, setChapterDirty, setChapterLastSavedAt, setCurrentNovel, syncStudioPayload } = latest.current
      const owner = epoch.current
      // 编辑器输入经 LocalFirstTextarea 防抖上报，闭包里的 chapterDraft 可能落后；
      // 保存时一律以最新 ref 为准，blur/自动保存都能拿到当前输入。
      const draft = chapterDraftStateRef.current
      if (!draft) {
        return
      }

      // 仅拦截待审查的那些章，其他章节正常保存
      if (pendingChapterReviewsRef.current.some((item) => item.chapterId === draft.id)) {
        if (reason !== 'auto') {
          promptConfirmPendingChapterReview('保存当前章节')
        }
        return
      }

      if (!draft.title.trim() || !draft.content.trim()) {
        if (reason !== 'auto') {
          setChapterSaveState('error')
          setChapterSaveMessage('章节标题和正文都不能为空。')
        }
        return
      }

      if (chapterSavingRef.current) {
        return
      }
      chapterSavingRef.current = true

      setChapterSaveState('saving')
      setChapterSaveMessage(reason === 'auto' ? '正在自动保存草稿...' : '正在保存章节...')

      try {
        const localDraftId = draft.localOnly ? draft.id : null
        const payload = {
          title: draft.title.trim(),
          summary: draft.summary.trim() || undefined,
          content: draft.content,
          status: draft.status,
          visibility: draft.visibility,
          ...(draft.localOnly ? {} : { expectedRevision: draft.revision }),
        }

        const savedChapter = draft.localOnly
          ? await createChapterDraft(activeNovelId, payload)
          : await updateChapterDraft(activeNovelId, draft.id, payload)

        if (owner !== epoch.current) return
        setChapters((current) =>
          replaceChapterItem(current, localDraftId, toChapterListItem(savedChapter)),
        )
        const latestDraft = chapterDraftStateRef.current
        const editsArrivedDuringSave = Boolean(
          latestDraft && latestDraft.id === draft.id && (
            latestDraft.title !== draft.title ||
            latestDraft.summary !== draft.summary ||
            latestDraft.content !== draft.content ||
            latestDraft.status !== draft.status ||
            latestDraft.visibility !== draft.visibility
          ),
        )
        // 保存请求可能跨越切章动作才完成：只有章节仍处于打开状态才写回编辑器状态，
        // 绝不把旧章内容盖到已切换的新章草稿上。
        const chapterStillOpen = latestDraft?.id === draft.id
        if (localDraftId) setSelectedTreeItemId(`chapter:${savedChapter.id}`)
        if (localDraftId || selectedChapterIdStateRef.current === draft.id) setSelectedChapterId(savedChapter.id)
        if (editsArrivedDuringSave && latestDraft) {
          // 网络请求期间用户仍可能继续输入。只接收服务端 revision/真实 id，绝不拿旧响应覆盖
          // 新输入；保留 dirty 让下一轮自动保存继续追上。
          setChapterDraft({ ...latestDraft, id: savedChapter.id, revision: savedChapter.revision, localOnly: false })
          setChapterDirty(true)
        } else if (chapterStillOpen) {
          setChapterDraft(buildChapterDraft(savedChapter))
          setChapterDirty(false)
        }
        if (chapterStillOpen) {
          setChapterSaveState('saved')
          setChapterLastSavedAt(savedChapter.updatedAt)
          setChapterSaveMessage(
            editsArrivedDuringSave
              ? '已保存上一批修改，正在继续保存新输入...'
              : reason === 'auto'
              ? `已自动保存于 ${formatDateTime(savedChapter.updatedAt)}`
              : `已保存于 ${formatDateTime(savedChapter.updatedAt)}`,
          )
        }
        setCurrentNovel((current) =>
          current
            ? {
                ...current,
                chapterCount: draft.localOnly ? current.chapterCount + 1 : current.chapterCount,
                updatedAt: savedChapter.updatedAt,
              }
            : current,
        )

        syncStudioPayload((current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            novel: {
              ...current.novel,
              chapterCount: draft.localOnly
                ? current.novel.chapterCount + 1
                : current.novel.chapterCount,
              updatedAt: savedChapter.updatedAt,
            },
            draftChapter:
              savedChapter.status === 'draft'
                ? savedChapter
                : current.draftChapter?.id === savedChapter.id
                  ? null
                  : current.draftChapter,
            chapters: replaceChapterItem(
              current.chapters,
              localDraftId,
              toChapterListItem(savedChapter),
            ),
          }
        })
      } catch (error) {
        if (owner !== epoch.current) return
        setChapterSaveState('error')
        setChapterSaveMessage(error instanceof Error ? error.message : '章节保存失败，请稍后重试。')
      } finally {
        if (owner === epoch.current) chapterSavingRef.current = false
      }
    },
    [],
  )

  useEffect(() => {
    if (!chapterDraft || !chapterDirty) {
      return
    }

    setChapterSaveState('pending')
    setChapterSaveMessage('检测到修改，正在自动保存...')
    const timer = window.setTimeout(() => {
      void persistChapter('auto')
    }, 800)

    return () => window.clearTimeout(timer)
  }, [chapterDirty, chapterDraft, persistChapter, setChapterSaveState, setChapterSaveMessage])
  useEffect(() => registerDesktopSave(async () => {
    const owner = epoch.current
    const deadline = Date.now() + 6500
    while (Date.now() < deadline) {
      if (owner !== epoch.current) return false
      if (!latest.current.chapterDirty && !chapterSavingRef.current) return true
      if (!chapterSavingRef.current) await persistChapter('auto')
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    }
    return false
  }), [persistChapter])
  return persistChapter
}
