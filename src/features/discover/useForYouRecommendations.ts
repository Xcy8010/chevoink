import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { NovelCard } from '../../../shared/contracts/index.js'
import { RECOMMEND_ALGORITHM_VERSIONS } from '../../../shared/recommend/scoring.js'

import { getForYouRecommendations, reportRecommendationEvents } from './api'
import { buildRecommendedNovels } from './recommend'

/**
 * 发现页「推荐作品」数据层（推荐算法优化方案 Phase 1）：
 * - 服务端 for-you 为唯一排序来源（方案 §11.1），接口失败/无结果时回退本地标签口味算法保证可用；
 * - 数据到位后批量上报曝光（按 sessionId+作品集合去重，重渲染不重复报）；
 * - 提供点击与「不感兴趣」负反馈上报入口（方案 §6.1/§6.2）。
 */

export type ForYouDisplayItem = {
  novel: NovelCard
  /** 服务端生成的推荐理由（本地回退时为 null） */
  reason: string | null
}

type UseForYouOptions = {
  /** 服务端不可用时的本地回退候选池 */
  fallbackPool: NovelCard[]
  /** 页面主推位已展示的作品，避免重复露出 */
  excludeIds: string[]
}

function newEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useForYouRecommendations({ fallbackPool, excludeIds }: UseForYouOptions) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  const serverQuery = useQuery({
    queryKey: ['for-you'],
    queryFn: () => getForYouRecommendations(),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  })

  const serverPayload = serverQuery.data
  const useServer = Boolean(serverPayload && serverPayload.items.length > 0)

  const localFallback = useMemo(
    () => buildRecommendedNovels(fallbackPool, 4, excludeIds),
    [fallbackPool, excludeIds],
  )

  const items: ForYouDisplayItem[] = useMemo(() => {
    const dismissed = new Set(dismissedIds)
    if (useServer && serverPayload) {
      const fromServer = serverPayload.items
        .filter((item) => !dismissed.has(item.novel.id))
        .map((item) => ({ novel: item.novel, reason: item.reason }))
      if (fromServer.length > 0) return fromServer
    }
    return localFallback.novels
      .filter((novel) => !dismissed.has(novel.id))
      .map((novel) => ({ novel, reason: null }))
  }, [useServer, serverPayload, localFallback, dismissedIds])

  const personalized = useServer && serverPayload ? serverPayload.personalized : localFallback.personalized
  const sessionId = serverPayload?.sessionId ?? 'local-fallback'
  const algorithmVersion = serverPayload?.algorithmVersion ?? RECOMMEND_ALGORITHM_VERSIONS.forYou

  // 曝光批量上报：以 sessionId+作品集合为键去重，避免重渲染/回退切换重复上报
  const impressionKey = `${sessionId}:${items.map((item) => item.novel.id).join(',')}`
  const reportedImpressions = useRef(new Set<string>())
  useEffect(() => {
    if (items.length === 0 || reportedImpressions.current.has(impressionKey)) return
    reportedImpressions.current.add(impressionKey)
    reportRecommendationEvents(
      items.map((item, index) => ({
        eventId: newEventId(),
        novelId: item.novel.id,
        surface: 'for-you' as const,
        position: index,
        eventType: 'impression' as const,
        sessionId,
        algorithmVersion,
      })),
    )
  }, [impressionKey, items, sessionId, algorithmVersion])

  const reportClick = useCallback(
    (novelId: string) => {
      const position = items.findIndex((item) => item.novel.id === novelId)
      reportRecommendationEvents([
        {
          eventId: newEventId(),
          novelId,
          surface: 'for-you',
          position: position >= 0 ? position : undefined,
          eventType: 'click',
          sessionId,
          algorithmVersion,
        },
      ])
    },
    [items, sessionId, algorithmVersion],
  )

  /** 负反馈：本地立即移除 + 上报 dismiss，服务端画像对该书与标签长期抑制 */
  const reportDismiss = useCallback(
    (novelId: string) => {
      setDismissedIds((prev) => (prev.includes(novelId) ? prev : [...prev, novelId]))
      reportRecommendationEvents([
        {
          eventId: newEventId(),
          novelId,
          surface: 'for-you',
          eventType: 'dismiss',
          sessionId,
          algorithmVersion,
        },
      ])
    },
    [sessionId, algorithmVersion],
  )

  return { items, personalized, reportClick, reportDismiss }
}
