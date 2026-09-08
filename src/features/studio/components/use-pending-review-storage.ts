import { useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ChapterPendingReview, PlanPendingReview } from '../types'
import { PENDING_CHAPTER_REVIEW_STORAGE_PREFIX, PENDING_PLAN_REVIEW_STORAGE_PREFIX, readStoredPendingReview, readStoredPendingReviewList, writeStoredPendingReview } from '../lib/plan-review'

/** Hydrate and persist only values owned by the currently selected novel. */
export function usePendingReviewStorage(
  novelId: string,
  chapters: ChapterPendingReview[],
  plan: PlanPendingReview | null,
  setChapters: Dispatch<SetStateAction<ChapterPendingReview[]>>,
  setPlan: Dispatch<SetStateAction<PlanPendingReview | null>>,
) {
  const [hydratedNovelId, setHydratedNovelId] = useState<string>()
  useLayoutEffect(() => {
    setChapters(readStoredPendingReviewList<ChapterPendingReview>(`${PENDING_CHAPTER_REVIEW_STORAGE_PREFIX}${novelId}`))
    setPlan(readStoredPendingReview<PlanPendingReview>(`${PENDING_PLAN_REVIEW_STORAGE_PREFIX}${novelId}`))
    setHydratedNovelId(novelId)
  }, [novelId, setChapters, setPlan])
  useLayoutEffect(() => {
    // The outgoing commit still contains the previous novel's review values.
    if (hydratedNovelId !== novelId) return
    writeStoredPendingReview(`${PENDING_CHAPTER_REVIEW_STORAGE_PREFIX}${novelId}`, chapters.length ? chapters : null)
    writeStoredPendingReview(`${PENDING_PLAN_REVIEW_STORAGE_PREFIX}${novelId}`, plan)
  }, [novelId, hydratedNovelId, chapters, plan])
}
