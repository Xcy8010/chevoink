import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { splitTtsBatches } from '../../../../shared/contracts/index.js'
import { saveReaderSettings, ttsRateOptions } from '../reader-settings'
import { fetchTtsBatchAudio, fetchTtsVoices } from './tts-api'

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'
export type TtsTimerOption = 'off' | 15 | 30 | 60 | 'chapter'

type UseTtsPlayerArgs = {
  novelId: string | undefined
  chapterId: string | undefined
  fromStudio: boolean
  paragraphs: string[]
  nextHref: string | null
  /** 下一章 id（自动翻章信号绑定目标，落点校正据此验证） */
  nextChapterId: string | null
  novelTitle: string
  chapterTitle: string
  coverUrl: string | null
  contentScrollRef: React.MutableRefObject<HTMLDivElement | null>
  initialVoice: string
  initialRate: number
  initialAutoNext: boolean
}

/** 手势内先播一段静音 wav 解锁 iOS 音频，再换真实音频（方案 17-4.3） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

/** 手动滚动后暂停自动跟随的时长 */
const USER_SCROLL_HOLD_MS = 5000

/** 听书会话快照（按作品存本机）：退出时是听书模式则重进阅读器默认恢复听书并续到上次位置 */
type TtsSessionSnapshot = {
  chapterId: string
  paragraphIndex: number
  charOffset: number
  savedAt: number
}

const ttsSessionKey = (novelId: string) => `chevoink:tts-session:${novelId}`

function readTtsSession(novelId: string | undefined, chapterId: string | undefined): TtsSessionSnapshot | null {
  if (!novelId || !chapterId) return null
  try {
    const raw = window.localStorage.getItem(ttsSessionKey(novelId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as TtsSessionSnapshot
    if (parsed.chapterId !== chapterId) return null
    if (typeof parsed.paragraphIndex !== 'number' || parsed.paragraphIndex < 0) return null
    return parsed
  } catch {
    return null
  }
}

function writeTtsSession(novelId: string, chapterId: string, paragraphIndex: number, charOffset: number) {
  try {
    const snapshot: TtsSessionSnapshot = { chapterId, paragraphIndex, charOffset, savedAt: Date.now() }
    window.localStorage.setItem(ttsSessionKey(novelId), JSON.stringify(snapshot))
  } catch {
    // 隐私模式等存储不可用：静默放弃会话持久化
  }
}

function clearTtsSession(novelId: string | undefined) {
  if (!novelId) return
  try {
    window.localStorage.removeItem(ttsSessionKey(novelId))
  } catch {
    // 同上
  }
}

/** 等音频元信息就绪（拿到 duration 才能 seek），超时即放弃 seek 从批首播 */
function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 1) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let timer = 0
    const done = () => {
      window.clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', done)
      audio.removeEventListener('error', done)
      resolve()
    }
    timer = window.setTimeout(done, 3000)
    audio.addEventListener('loadedmetadata', done)
    audio.addEventListener('error', done)
  })
}

/**
 * 听书播放引擎（方案 17-4.2）：
 * - 批次队列 + objectURL 预取下一批，批间隙感知 <100ms
 * - 语速走 playbackRate（合成一律原速，缓存键无语速维度）
 * - 段落高亮按批内字数占比映射 currentTime，自动滚动居中（手动滚动 5s 内不抢）
 * - 章末自动续播下一章、定时关闭、Media Session 锁屏控制
 */
export function useTtsPlayer(args: UseTtsPlayerArgs) {
  const {
    novelId,
    chapterId,
    fromStudio,
    paragraphs,
    nextHref,
    nextChapterId,
    novelTitle,
    chapterTitle,
    coverUrl,
    contentScrollRef,
    initialVoice,
    initialRate,
    initialAutoNext,
  } = args

  const navigate = useNavigate()

  const [status, setStatus] = useState<TtsStatus>('idle')
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null)
  const [voiceIdState, setVoiceIdState] = useState(initialVoice)
  const [rate, setRateState] = useState(initialRate)
  const [autoNext, setAutoNextState] = useState(initialAutoNext)
  const [timerOption, setTimerOptionState] = useState<TtsTimerOption>('off')
  const [timerDeadline, setTimerDeadline] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // 30s 一跳，仅驱动"剩余 X 分钟"文案刷新
  const [, setTimerTick] = useState(0)

  const voicesQuery = useQuery({
    queryKey: ['tts-voices'],
    queryFn: fetchTtsVoices,
    enabled: !fromStudio,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  })

  const voices = voicesQuery.data?.voices ?? []
  const defaultVoiceId = voicesQuery.data?.defaultVoiceId ?? ''
  const available = Boolean(voicesQuery.data?.available && voices.length > 0 && !fromStudio)
  /** 生效音色：本地持久化优先，失效（白名单下线）回退服务端默认 */
  const voiceId =
    voiceIdState && voices.some((voice) => voice.id === voiceIdState) ? voiceIdState : defaultVoiceId
  const voiceLabel = voices.find((voice) => voice.id === voiceId)?.label ?? '默认音色'

  const batches = useMemo(() => splitTtsBatches(paragraphs), [paragraphs])

  // ---- 可变引用（异步回调里取最新值） ----
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unlockedRef = useRef(false)
  const sessionRef = useRef(0)
  const blobUrlsRef = useRef(new Map<string, string>())
  const fetchingRef = useRef(new Map<string, Promise<string>>())
  const pendingResumeRef = useRef(false)
  /**
   * 自动翻章信号：章末续播 navigate 前置位，供分页阅读层把落点钉在新章第一页。
   * 记录目标章节 id：信号只对绑定的目标章有效——若落地没被消费（占位期被打断/退出阅读器等），
   * 残留标志不会让后续任意一次手动换章被误判成「听书自动翻章」而错钉到第 1 页。
   */
  const pendingAutoNextTargetRef = useRef<string | null>(null)
  /** 当前朗读段落内的字符位置（近似，按批内字数占比折算） */
  const charOffsetRef = useRef(0)
  /** 听书位置快照（段落+段内字符），会话持久化数据源 */
  const ttsPosRef = useRef({ paragraphIndex: 0, charOffset: 0 })
  const lastPersistAtRef = useRef(0)
  /** 浏览器拦截自动播放（无用户手势）时的续播位置：点一次播放从原位继续 */
  const autoplayBlockRef = useRef<{ batchIndex: number; paragraphIndex: number; charOffset: number } | null>(null)
  /** 进入阅读器待自动恢复的听书会话（同作品同章节、上次以听书模式退出） */
  const autoResumeRef = useRef<TtsSessionSnapshot | null>(null)
  const userScrollUntilRef = useRef(0)
  const programmaticScrollUntilRef = useRef(0)
  const stateRef = useRef({
    batches,
    paragraphs,
    rate,
    autoNext,
    timerOption,
    nextHref,
    nextChapterId,
    novelId,
    chapterId,
    voiceId,
    currentBatchIndex,
    status,
  })
  stateRef.current = {
    batches,
    paragraphs,
    rate,
    autoNext,
    timerOption,
    nextHref,
    nextChapterId,
    novelId,
    chapterId,
    voiceId,
    currentBatchIndex,
    status,
  }

  /** 落听书会话（作品+章节+段落位置）：播放/暂停/卸载时调用，供重进阅读器恢复 */
  const persistSession = useCallback(() => {
    const { novelId: novel, chapterId: chapter, status: currentStatus } = stateRef.current
    if (fromStudio || !novel || !chapter) return
    if (currentStatus !== 'playing' && currentStatus !== 'paused' && currentStatus !== 'loading') return
    writeTtsSession(novel, chapter, ttsPosRef.current.paragraphIndex, ttsPosRef.current.charOffset)
  }, [fromStudio])

  const blobKey = (chapter: string, voice: string, batchIndex: number) =>
    `${chapter}:${voice}:${batchIndex}`

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    blobUrlsRef.current.clear()
    fetchingRef.current.clear()
  }, [])

  /** 拿一批音频的 objectURL（缓存 → 进行中请求 → 新请求） */
  const getBatchAudio = useCallback((batchIndex: number): Promise<string> => {
    const { novelId: novel, chapterId: chapter, voiceId: voice } = stateRef.current
    if (!novel || !chapter || !voice) return Promise.reject(new Error('章节未就绪'))

    const key = blobKey(chapter, voice, batchIndex)
    const cached = blobUrlsRef.current.get(key)
    if (cached) return Promise.resolve(cached)

    const inflight = fetchingRef.current.get(key)
    if (inflight) return inflight

    const task = fetchTtsBatchAudio({ novelId: novel, chapterId: chapter, batchIndex, voiceId: voice })
      .then((url) => {
        blobUrlsRef.current.set(key, url)
        return url
      })
      .finally(() => {
        fetchingRef.current.delete(key)
      })

    fetchingRef.current.set(key, task)
    return task
  }, [])

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  /**
   * 播放指定批次（核心推进函数）。
   * 传 seekParagraph 时按段落在批内的字数占比跳到对应时间点（与 handleTimeUpdate 的映射同源），
   * 避免「从本段听」/听书入口被拉回批首（一批可能横跨好几页）；
   * seekChar 进一步细化到段内字符位置（分页续块起播，避免回读上一页）。
   */
  const playBatch = useCallback(
    async (batchIndex: number, seekParagraph?: number, seekChar?: number) => {
      const session = sessionRef.current
      const audio = getAudio()

      setCurrentBatchIndex(batchIndex)
      setErrorMessage(null)
      setStatus('loading')
      charOffsetRef.current = 0

      try {
        const url = await getBatchAudio(batchIndex)
        if (sessionRef.current !== session) return

        audio.src = url
        // 同一 src 复用（缓存 blob 重播）不会重置进度：显式归零，
        // 避免带着上次的播放位置开播；下方有 seek 需求时会再按目标位置覆盖
        audio.currentTime = 0
        audio.playbackRate = stateRef.current.rate

        const batch = stateRef.current.batches[batchIndex]
        // 段落落在批首段时也要 seek：分页续块起播（seekChar > 0）否则会回读上一页内容
        const needSeek =
          batch &&
          typeof seekParagraph === 'number' &&
          (seekParagraph > batch.paragraphStart ||
            (seekParagraph === batch.paragraphStart && typeof seekChar === 'number' && seekChar > 0))
        if (needSeek && typeof seekParagraph === 'number') {
          setActiveParagraphIndex(seekParagraph)
          await waitForMetadata(audio)
          if (sessionRef.current !== session) return

          const duration = audio.duration
          if (duration && Number.isFinite(duration)) {
            const { paragraphs: allParagraphs } = stateRef.current
            let ratio = 0
            for (let i = batch.paragraphStart; i < seekParagraph; i += 1) {
              ratio += (allParagraphs[i]?.length ?? 0) / Math.max(1, batch.charCount)
            }
            // 段内字符偏移（分页续块起播）：补上本段已翻到上一页的部分，避免回读上一页内容
            const seekCharOffset = typeof seekChar === 'number' ? Math.max(0, seekChar) : 0
            const seekParagraphLength = allParagraphs[seekParagraph]?.length ?? 0
            if (seekParagraphLength > 0 && seekCharOffset > 0) {
              ratio += Math.min(1, seekCharOffset / seekParagraphLength) * (seekParagraphLength / Math.max(1, batch.charCount))
            }
            const target = Math.min(Math.max(0, duration * ratio), Math.max(0, duration - 0.3))
            if (target > 0.1) audio.currentTime = target
          }
        }

        ttsPosRef.current =
          typeof seekParagraph === 'number'
            ? { paragraphIndex: seekParagraph, charOffset: typeof seekChar === 'number' ? seekChar : 0 }
            : { paragraphIndex: batch?.paragraphStart ?? 0, charOffset: 0 }

        await audio.play()
        if (sessionRef.current !== session) return

        setStatus('playing')

        // 预取下一批，批间隙无缝续播
        if (batchIndex + 1 < stateRef.current.batches.length) {
          void getBatchAudio(batchIndex + 1).catch((): undefined => undefined)
        }
      } catch (error) {
        if (sessionRef.current !== session) return
        // 自动恢复听书时 play 无用户手势会被浏览器拦截：落暂停态记住位置，点一次播放从原位续
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          autoplayBlockRef.current = {
            batchIndex,
            paragraphIndex: typeof seekParagraph === 'number' ? seekParagraph : -1,
            charOffset: typeof seekChar === 'number' ? seekChar : 0,
          }
          if (typeof seekParagraph === 'number') setActiveParagraphIndex(seekParagraph)
          setStatus('paused')
          return
        }
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : '听书暂时不可用，请稍后重试。')
      }
    },
    [getAudio, getBatchAudio],
  )

  const playBatchRef = useRef(playBatch)
  playBatchRef.current = playBatch

  /** 一批播完：推进下一批 / 播完本章停 / 自动翻章 / 全书完 */
  const handleBatchEnded = useCallback(() => {
    // 只有 playing 中的 ended 才是真实批次播完：首次起播时用静音 wav 解锁 iOS 音频，
    // 静音 wav 会在合成等待期（status=loading）先播完触发 ended，若不拦截会把播放
    // 提前推进到下一批，与本批合成完成后的播放竞态，表现为「起播直接读后面段落」
    if (stateRef.current.status !== 'playing') return

    const { batches: allBatches, currentBatchIndex: index, autoNext: shouldAutoNext, timerOption: timer, nextHref: next } =
      stateRef.current

    if (index + 1 < allBatches.length) {
      void playBatchRef.current(index + 1)
      return
    }

    // 章末
    if (timer === 'chapter') {
      setTimerOptionState('off')
      setStatus('ended')
      setActiveParagraphIndex(null)
      clearTtsSession(stateRef.current.novelId)
      return
    }

    if (shouldAutoNext && next) {
      pendingResumeRef.current = true
      pendingAutoNextTargetRef.current = stateRef.current.nextChapterId
      navigate(next)
      return
    }

    setStatus('ended')
    setActiveParagraphIndex(null)
    clearTtsSession(stateRef.current.novelId)
  }, [navigate])

  /**
   * timeupdate：按批内各段字数占比把播放进度映射为段落下标，
   * 同时算出段内朗读到的字符位置（跨页段落靠它判断该停在哪一页）。
   * 段内位置放 ref 不进 state：timeupdate 每秒 4 次，进 state 会让整个阅读器跟着重渲染。
   */
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    const { batches: allBatches, paragraphs: allParagraphs, currentBatchIndex: index, status: currentStatus } =
      stateRef.current
    if (!audio || currentStatus !== 'playing') return

    const batch = allBatches[index]
    if (!batch || !audio.duration || !Number.isFinite(audio.duration)) return

    const progress = Math.min(1, audio.currentTime / audio.duration)
    let cumulative = 0
    let target = batch.paragraphStart

    for (let i = batch.paragraphStart; i <= batch.paragraphEnd; i += 1) {
      const length = allParagraphs[i]?.length ?? 0
      const share = length / Math.max(1, batch.charCount)
      target = i
      if (progress < cumulative + share || i === batch.paragraphEnd) {
        const within = share > 0 ? (progress - cumulative) / share : 0
        charOffsetRef.current = Math.min(length, Math.max(0, Math.round(within * length)))
        break
      }
      cumulative += share
    }

    ttsPosRef.current = { paragraphIndex: target, charOffset: charOffsetRef.current }
    // 节流落听书会话：重进阅读器可恢复听书模式与上次位置
    if (Date.now() - lastPersistAtRef.current > 2000) {
      lastPersistAtRef.current = Date.now()
      persistSession()
    }

    setActiveParagraphIndex((previous) => (previous === target ? previous : target))
  }, [persistSession])

  // 音频元素事件绑定（一次）
  useEffect(() => {
    const audio = getAudio()
    const onEnded = () => handleBatchEnded()
    const onTime = () => handleTimeUpdate()

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTime)

    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTime)
    }
  }, [getAudio, handleBatchEnded, handleTimeUpdate])

  /** 从阅读视口内第一个可见段落开始播放（听书入口点击） */
  const start = useCallback(() => {
    const audio = getAudio()

    // iOS：首次 play 必须发生在用户手势调用栈内
    if (!unlockedRef.current) {
      audio.src = SILENT_WAV
      void audio.play().catch((): undefined => undefined)
      unlockedRef.current = true
    }

    const { batches: allBatches } = stateRef.current
    if (allBatches.length === 0) return

    let startBatch = 0
    // 没读过（滚动条在顶部）时取不到可见段落，就从开头第一段读起
    let startParagraph = 0
    const container = contentScrollRef.current
    if (container) {
      const containerTop = container.getBoundingClientRect().top
      const nodes = container.querySelectorAll<HTMLElement>('[data-tts-p]')
      for (const node of nodes) {
        if (node.getBoundingClientRect().bottom > containerTop + 8) {
          const paragraphIndex = Number(node.dataset.ttsP)
          const matched = allBatches.find(
            (batch) => paragraphIndex >= batch.paragraphStart && paragraphIndex <= batch.paragraphEnd,
          )
          if (matched) {
            startBatch = matched.index
            startParagraph = paragraphIndex
          }
          break
        }
      }
    }

    sessionRef.current += 1
    void playBatchRef.current(startBatch, startParagraph)
  }, [contentScrollRef, getAudio])

  /** 从指定段落开始播放（分页模式听书入口 / 长按「从本段听」）。
   * charOffset：段内起始字符（分页页首块是跨页段落续块时传，避免从上一页读起）。 */
  const startFromParagraph = useCallback(
    (paragraphIndex: number, charOffset?: number) => {
      const audio = getAudio()

      // iOS：首次 play 必须发生在用户手势调用栈内
      if (!unlockedRef.current) {
        audio.src = SILENT_WAV
        void audio.play().catch((): undefined => undefined)
        unlockedRef.current = true
      }

      const { batches: allBatches } = stateRef.current
      if (allBatches.length === 0) return

      const matched = allBatches.find(
        (batch) => paragraphIndex >= batch.paragraphStart && paragraphIndex <= batch.paragraphEnd,
      )

      sessionRef.current += 1
      void playBatchRef.current(matched ? matched.index : 0, matched ? paragraphIndex : 0, charOffset)
    },
    [getAudio],
  )

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setStatus((previous) => (previous === 'playing' ? 'paused' : previous))
    persistSession()
  }, [persistSession])

  const resume = useCallback(() => {
    // 自动播放被拦截的续播：用户点播放即手势，从记住的位置起播
    const blocked = autoplayBlockRef.current
    if (blocked) {
      autoplayBlockRef.current = null
      sessionRef.current += 1
      void playBatchRef.current(
        blocked.batchIndex,
        blocked.paragraphIndex >= 0 ? blocked.paragraphIndex : undefined,
        blocked.charOffset > 0 ? blocked.charOffset : undefined,
      )
      return
    }
    const { status: currentStatus, currentBatchIndex: index } = stateRef.current
    if (currentStatus === 'paused' && audioRef.current?.src) {
      void audioRef.current.play().then(() => setStatus('playing')).catch((): undefined => undefined)
      return
    }
    if (currentStatus === 'ended' || currentStatus === 'error') {
      sessionRef.current += 1
      void playBatchRef.current(currentStatus === 'ended' ? 0 : index)
    }
  }, [])

  const toggle = useCallback(() => {
    if (stateRef.current.status === 'playing') {
      pause()
    } else {
      resume()
    }
  }, [pause, resume])

  const stop = useCallback(() => {
    sessionRef.current += 1
    pendingResumeRef.current = false
    pendingAutoNextTargetRef.current = null
    clearTtsSession(stateRef.current.novelId)
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
    revokeAllBlobs()
    setStatus('idle')
    setActiveParagraphIndex(null)
    setTimerOptionState('off')
    setTimerDeadline(null)
    setErrorMessage(null)
  }, [revokeAllBlobs])

  const jumpBatch = useCallback((delta: number) => {
    const { currentBatchIndex: index, batches: allBatches } = stateRef.current
    const target = index + delta
    if (target < 0 || target >= allBatches.length) return
    sessionRef.current += 1
    void playBatchRef.current(target)
  }, [])

  const setVoice = useCallback(
    (nextVoiceId: string) => {
      setVoiceIdState(nextVoiceId)
      saveReaderSettings({ ttsVoice: nextVoiceId })

      // 播放中切音色：清缓存，从当前批用新音色重播
      const { status: currentStatus, currentBatchIndex: index } = stateRef.current
      if (currentStatus === 'playing' || currentStatus === 'paused' || currentStatus === 'loading') {
        sessionRef.current += 1
        audioRef.current?.pause()
        revokeAllBlobs()
        // stateRef 在下一次渲染才更新 voiceId，这里直接写入让 getBatchAudio 立即取到新值
        stateRef.current.voiceId = nextVoiceId
        void playBatchRef.current(index)
      }
    },
    [revokeAllBlobs],
  )

  const setRate = useCallback((nextRate: number) => {
    if (!ttsRateOptions.some((option) => option === nextRate)) return
    setRateState(nextRate)
    saveReaderSettings({ ttsRate: nextRate })
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }, [])

  const setAutoNext = useCallback((next: boolean) => {
    setAutoNextState(next)
    saveReaderSettings({ ttsAutoNext: next })
  }, [])

  const setTimerOption = useCallback((option: TtsTimerOption) => {
    setTimerOptionState(option)
    setTimerDeadline(typeof option === 'number' ? Date.now() + option * 60_000 : null)
  }, [])

  // 定时关闭：到点即停
  useEffect(() => {
    if (!timerDeadline) return

    const check = () => {
      if (Date.now() >= timerDeadline) {
        stop()
        return
      }
      setTimerTick((tick) => tick + 1)
    }

    const interval = window.setInterval(check, 30_000)
    const timeout = window.setTimeout(check, Math.max(0, timerDeadline - Date.now()) + 50)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [timerDeadline, stop])

  // 章节切换：重置播放态；若带"待续播"标记（自动翻章），批次就绪后从头续播
  useEffect(() => {
    sessionRef.current += 1
    audioRef.current?.pause()
    revokeAllBlobs()
    setActiveParagraphIndex(null)
    setCurrentBatchIndex(0)
    autoplayBlockRef.current = null
    ttsPosRef.current = { paragraphIndex: 0, charOffset: 0 }
    autoResumeRef.current = fromStudio ? null : readTtsSession(novelId, chapterId)
    if (!pendingResumeRef.current) {
      setStatus((previous) => (previous === 'idle' ? previous : 'idle'))
    }
  }, [chapterId, revokeAllBlobs, fromStudio, novelId])

  useEffect(() => {
    if (pendingResumeRef.current && batches.length > 0) {
      pendingResumeRef.current = false
      sessionRef.current += 1
      void playBatchRef.current(0)
    }
  }, [chapterId, batches])

  // 听书会话自动恢复：上次以听书模式退出且重进同一章节，批次+音色就绪后从上次位置起播；
  // 无手势被浏览器拦截时落暂停态（迷你栏可见），点一次播放从原位续
  useEffect(() => {
    const target = autoResumeRef.current
    if (!target || fromStudio || batches.length === 0 || !voiceId) return
    if (stateRef.current.status !== 'idle') return
    autoResumeRef.current = null
    sessionRef.current += 1
    const paragraphIndex = Math.min(target.paragraphIndex, paragraphs.length - 1)
    const matched = batches.find(
      (batch) => paragraphIndex >= batch.paragraphStart && paragraphIndex <= batch.paragraphEnd,
    )
    void playBatchRef.current(
      matched ? matched.index : 0,
      matched ? paragraphIndex : 0,
      target.charOffset > 0 ? target.charOffset : undefined,
    )
  }, [batches, voiceId, fromStudio, paragraphs])

  // 手动滚动 5s 内暂停自动跟随（程序化滚动通过时间窗标记区分）
  useEffect(() => {
    if (status !== 'playing') return
    const container = contentScrollRef.current
    if (!container) return

    const onScroll = () => {
      if (Date.now() > programmaticScrollUntilRef.current) {
        userScrollUntilRef.current = Date.now() + USER_SCROLL_HOLD_MS
      }
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [status, contentScrollRef])

  // 高亮段落自动滚动居中
  useEffect(() => {
    if (activeParagraphIndex === null || status !== 'playing') return
    if (Date.now() < userScrollUntilRef.current) return

    const node = contentScrollRef.current?.querySelector<HTMLElement>(
      `[data-tts-p="${activeParagraphIndex}"]`,
    )
    if (!node) return

    programmaticScrollUntilRef.current = Date.now() + 1200
    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeParagraphIndex, status, contentScrollRef])

  // Media Session：锁屏/系统媒体中心控制（方案 17-4.2）
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (status !== 'playing' && status !== 'paused') return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapterTitle,
      artist: novelTitle,
      album: '启创墨域 · 听书',
      artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512' }] : [],
    })
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused'

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => resume()],
      ['pause', () => pause()],
      ['previoustrack', () => jumpBatch(-1)],
      ['nexttrack', () => jumpBatch(1)],
    ]

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // 个别浏览器不支持某些 action
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // 忽略
        }
      }
    }
  }, [status, chapterTitle, novelTitle, coverUrl, resume, pause, jumpBatch])

  // 卸载清理：停止播放、释放 objectURL；听书态退出先落会话供重进恢复
  useEffect(() => {
    return () => {
      persistSession()
      sessionRef.current += 1
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 卸载清理须读 ref 最新值，拷贝进 effect 反而读到注册时的旧值
      blobUrlsRef.current.clear()
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上：清理时读 ref 最新值
      fetchingRef.current.clear()
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null
      }
    }
  }, [persistSession])

  const timerRemainingMinutes = timerDeadline
    ? Math.max(1, Math.ceil((timerDeadline - Date.now()) / 60_000))
    : null

  return {
    available,
    voices,
    voiceId,
    voiceLabel,
    status,
    isActive: status !== 'idle',
    currentBatchIndex,
    totalBatches: batches.length,
    activeParagraphIndex,
    /** 当前朗读段落内的字符位置（跨页段落判定当前页用；读 ref，不参与渲染） */
    getActiveCharOffset: () => charOffsetRef.current,
    rate,
    autoNext,
    timerOption,
    timerRemainingMinutes,
    errorMessage,
    hasPrevBatch: currentBatchIndex > 0,
    hasNextBatch: currentBatchIndex + 1 < batches.length,
    start,
    startFromParagraph,
    /**
     * 消费「自动翻章」信号：仅当信号绑定的目标章与传入章节一致时返回 true（取过即清）；
     * 指向其他章节的残留信号一并作废，避免误钉手动换章的落点
     */
    takePendingAutoNext: (targetChapterId: string) => {
      const pendingTarget = pendingAutoNextTargetRef.current
      if (!pendingTarget) return false
      pendingAutoNextTargetRef.current = null
      return pendingTarget === targetChapterId
    },
    toggle,
    pause,
    resume,
    stop,
    nextBatch: () => jumpBatch(1),
    prevBatch: () => jumpBatch(-1),
    setVoice,
    setRate,
    setAutoNext,
    setTimerOption,
  }
}

export type TtsPlayer = ReturnType<typeof useTtsPlayer>
