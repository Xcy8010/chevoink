import type { Dispatch, SetStateAction } from 'react'
import type { StudioPayload } from '../../../../shared/contracts/index.js'
import type { ToastContextValue } from '@/components/ui/toast-context'
import { createVolume, deleteChapterDraft, listNovelPlanFiles, moveChapter, updateChapterDraft, updateNovelPlanFile } from '../api'
import { buildServerPlanFile, removeChapterAndCompact } from '../lib/plan-review'
import type { ChapterDraftState, SaveState, WorkspacePlanFile } from '../types'

type CatalogActions = {
  activeNovelId: string
  volumes: StudioPayload['volumes']
  chapters: StudioPayload['chapters']
  chapterDirty: boolean
  chapterDraft: ChapterDraftState | null
  selectedChapterId: string | null
  savedPlanFiles: WorkspacePlanFile[]
  setVolumes: Dispatch<SetStateAction<StudioPayload['volumes']>>
  setChapters: Dispatch<SetStateAction<StudioPayload['chapters']>>
  setSelectedChapterId: Dispatch<SetStateAction<string | null>>
  setServerPlanFiles: Dispatch<SetStateAction<WorkspacePlanFile[]>>
  setChapterSaveState: Dispatch<SetStateAction<SaveState>>
  setChapterSaveMessage: Dispatch<SetStateAction<string>>
  syncStudioPayload: (updater: (current: StudioPayload | undefined) => StudioPayload | undefined) => void
  refreshWorkspaceAfterAgentWrite: () => Promise<void>
  handleChapterDraftChange: (draft: ChapterDraftState) => void
  toast: ToastContextValue
}

/** Catalog mutations preserve revision checks; editor save and dialogs remain owned by their callers. */
export function createCatalogActions({
  activeNovelId, volumes, chapters, chapterDirty, chapterDraft, selectedChapterId, savedPlanFiles,
  setVolumes, setChapters, setSelectedChapterId, setServerPlanFiles, setChapterSaveState,
  setChapterSaveMessage, syncStudioPayload, refreshWorkspaceAfterAgentWrite, handleChapterDraftChange, toast,
}: CatalogActions) {
  async function handleCreateLocalVolume() {
    setChapterSaveState('saving')
    setChapterSaveMessage('正在创建新卷...')
    try {
      const nextOrder = volumes.length + 1
      const created = await createVolume(activeNovelId, {
        title: `第 ${nextOrder} 卷`,
        position: nextOrder,
      })
      const nextVolume: StudioPayload['volumes'][number] = { ...created, chapterCount: 0, wordCount: 0 }
      setVolumes((current) => [...current, nextVolume].sort((left, right) => left.orderIndex - right.orderIndex))
      syncStudioPayload((current) => current ? {
        ...current,
        volumes: [...current.volumes, nextVolume].sort((left, right) => left.orderIndex - right.orderIndex),
      } : current)
      setChapterSaveState('saved')
      setChapterSaveMessage(`已创建“${created.title}”，现在可以在卷内新建章节。`)
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '新卷创建失败，请稍后重试。')
    }
  }

  async function handleMoveChapterInTree(chapterId: string, targetVolumeId: string, position: number) {
    if (chapterDirty) {
      toast.error('请等待当前章节自动保存后再调整顺序。')
      return
    }
    const target = chapters.find((chapter) => chapter.id === chapterId)
    if (!target || (target.volumeId === targetVolumeId && target.orderInVolume === position)) return
    try {
      await moveChapter(activeNovelId, chapterId, {
        targetVolumeId,
        position,
        expectedRevision: target.revision,
      })
      await refreshWorkspaceAfterAgentWrite()
      toast.success('章节顺序已更新。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '章节移动失败，请重试。')
    }
  }

  async function handleMovePlanInTree(planId: string, position: number) {
    const target = savedPlanFiles.find((plan) => plan.id === planId)
    if (!target?.backendArtifactId) {
      toast.error('这份计划仍在同步中，请稍后再排序。')
      return
    }
    const currentIndex = savedPlanFiles.findIndex((plan) => plan.id === planId)
    if (currentIndex === position - 1) return
    try {
      await updateNovelPlanFile(target.backendArtifactId, { position })
      const items = await listNovelPlanFiles(activeNovelId)
      setServerPlanFiles(items.map(buildServerPlanFile))
      toast.success('计划顺序已更新。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '计划移动失败，请重试。')
    }
  }

  async function handleDeleteChapterById(chapterId: string) {
    const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId)
    if (currentIndex < 0) {
      return
    }

    const remainingChapters = removeChapterAndCompact(chapters, chapterId)
    const fallbackChapter =
      remainingChapters[Math.min(currentIndex, remainingChapters.length - 1)] ??
      remainingChapters[remainingChapters.length - 1] ??
      null

    await deleteChapterDraft(activeNovelId, chapterId, chapters[currentIndex].revision)
    setChapters((current) => removeChapterAndCompact(current, chapterId))
    if (selectedChapterId === chapterId || chapterDraft?.id === chapterId) {
      setSelectedChapterId(fallbackChapter?.id ?? null)
    }
    toast.success('章节已删除。')
  }

  /** 作品树右键重命名章节：当前章改草稿走自动保存，其它章直接 PATCH 并同步列表 */
  async function handleRenameChapterById(chapterId: string, nextTitle: string) {
    const trimmed = nextTitle.trim()
    if (!trimmed) {
      return
    }

    if (chapterDraft?.id === chapterId) {
      handleChapterDraftChange({ ...chapterDraft, title: trimmed })
      return
    }

    const target = chapters.find((chapter) => chapter.id === chapterId)
    if (!target) {
      return
    }

    try {
      const updated = await updateChapterDraft(activeNovelId, chapterId, {
        title: trimmed,
        expectedRevision: target.revision,
      })
      setChapters((current) => current.map((chapter) => chapter.id === chapterId ? { ...chapter, title: updated.title, revision: updated.revision } : chapter))
      toast.success('章节标题已更新。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '章节重命名失败，请重试。')
    }
  }

  return { handleCreateLocalVolume, handleMoveChapterInTree, handleMovePlanInTree, handleDeleteChapterById, handleRenameChapterById }
}
