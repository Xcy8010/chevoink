import { useQuery } from '@tanstack/react-query'
import { BookOpen, Bookmark, FileText, PenLine } from 'lucide-react'
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ApiClientError, requestJson } from '@/app/api-client'
import AppState from '@/components/ui/AppState'
import { ProfileSkeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { getMe, listPosts } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { getCoverUrl, getNovelDetailPayload } from '@/features/discover/api'
import { getAllReadingProgress } from '@/features/home/reading-progress'
import { getLocalShelf, updateShelfCover } from '@/features/home/local-shelf'
import CreationPanel from '@/features/profile/components/CreationPanel'
import ProfileHeader from '@/features/profile/components/ProfileHeader'
import ShelfPanel, { type ShelfBook } from '@/features/profile/components/ShelfPanel'
import { useShellStore } from '@/store/useShellStore'
import type { UpdateMyAvatarRequest, UpdateMyProfileRequest, User } from '../../shared/contracts'

const panels = [
  { id: 'shelf', label: '书架' },
  { id: 'creation', label: '创作' },
  { id: 'favorites', label: '收藏' },
] as const

type ProfilePanel = (typeof panels)[number]['id']

type ProfileRouteState = {
  showPostRegisterPrompt?: boolean
}

// 新建默认名已改为「未命名作品」；保留旧名识别，兼容存量引导作品
const BOOTSTRAP_NOVEL_TITLES = new Set(['未命名作品', '我的第一部作品'])
const BOOTSTRAP_NOVEL_SUMMARY = '先创建一部作品，再继续完善简介、章节和封面。'

function isBootstrapNovel(novel: {
  title: string
  displayTitle: string | null
  summary: string
  chapterCount: number
  wordCount: number
}) {
  return (
    BOOTSTRAP_NOVEL_TITLES.has(novel.title) &&
    !novel.displayTitle?.trim() &&
    novel.summary === BOOTSTRAP_NOVEL_SUMMARY &&
    novel.chapterCount === 0 &&
    novel.wordCount === 0
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const syncSessionUser = useShellStore((state) => state.syncSessionUser)
  const unreadMessageCount = useShellStore((state) => state.unreadMessageCount)
  const unreadNotificationCount = useShellStore((state) => state.unreadNotificationCount)

  const [activePanel, setActivePanel] = useState<ProfilePanel>('shelf')
  const [postRegisterPromptVisible, setPostRegisterPromptVisible] = useState(false)
  const [editDialogVisible, setEditDialogVisible] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [avatarSubmitting, setAvatarSubmitting] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const routeState = location.state as ProfileRouteState | null

    if (!routeState?.showPostRegisterPrompt) {
      return
    }

    setPostRegisterPromptVisible(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const meQuery = useQuery({
    queryKey: ['community', 'me'],
    queryFn: getMe,
  })

  const postsQuery = useQuery({
    queryKey: ['community', 'posts'],
    queryFn: () => listPosts(40),
  })

  const currentUser = meQuery.data?.user ?? null
  const mePayload = meQuery.data ?? null

  useEffect(() => {
    if (!currentUser) {
      return
    }

    setNicknameDraft(currentUser.nickname)
    setBioDraft(currentUser.bio ?? '')
  }, [currentUser])

  const authoredNovels = useMemo(() => {
    return mePayload?.authoredNovels ?? []
  }, [mePayload?.authoredNovels])

  const visibleAuthoredNovels = useMemo(
    () => authoredNovels.filter((novel) => !isBootstrapNovel(novel)),
    [authoredNovels],
  )

  const hiddenBootstrapNovelIds = useMemo(
    () => new Set(authoredNovels.filter((novel) => isBootstrapNovel(novel)).map((novel) => novel.id)),
    [authoredNovels],
  )

  const authoredPosts = useMemo(() => {
    if (!currentUser) {
      return []
    }

    return (postsQuery.data?.items ?? []).filter((post) => post.author.id === currentUser.id)
  }, [currentUser, postsQuery.data?.items])

  const draftItems = useMemo(
    () => (mePayload?.drafts ?? []).filter((draft) => !hiddenBootstrapNovelIds.has(draft.novelId)),
    [hiddenBootstrapNovelIds, mePayload?.drafts],
  )

  /** 本地阅读进度与书架（页面渲染时读取，me 数据刷新后重读） */
  const progressMap = useMemo(
    () => getAllReadingProgress(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meQuery.dataUpdatedAt],
  )
  const localShelf = useMemo(
    () => getLocalShelf(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meQuery.dataUpdatedAt],
  )

  /** 合并服务端书架 + 本地书架 + 仅有阅读进度的作品 */
  const mergedShelf = useMemo<ShelfBook[]>(() => {
    const seen = new Set<string>()
    const items: ShelfBook[] = []

    for (const item of mePayload?.shelf ?? []) {
      const novelId = item.novelId ?? null
      if (novelId) {
        seen.add(novelId)
      }
      items.push({
        key: item.id,
        novelId,
        title: item.title,
        coverUrl: getCoverUrl(item.coverUrl),
        summary: item.summary ?? '',
      })
    }

    for (const entry of localShelf) {
      if (seen.has(entry.novelId)) {
        continue
      }
      seen.add(entry.novelId)
      items.push({
        key: `local-${entry.novelId}`,
        novelId: entry.novelId,
        title: entry.title,
        coverUrl: getCoverUrl(entry.coverUrl),
        summary: '',
      })
    }

    for (const entry of Object.values(progressMap)) {
      if (seen.has(entry.novelId)) {
        continue
      }
      seen.add(entry.novelId)
      items.push({
        key: `progress-${entry.novelId}`,
        novelId: entry.novelId,
        title: entry.novelTitle,
        coverUrl: null,
        summary: '正在阅读中',
      })
    }

    return items
  }, [localShelf, mePayload?.shelf, progressMap])

  /** 缺封面条目回源补拉：收藏/阅读时作品还没封面，之后生成了封面也能显示出来 */
  const missingCoverIds = useMemo(
    () => mergedShelf.filter((item) => item.novelId && !item.coverUrl).map((item) => item.novelId as string),
    [mergedShelf],
  )
  const coverBackfillQuery = useQuery({
    queryKey: ['profile', 'shelf-cover-backfill', missingCoverIds],
    enabled: missingCoverIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.allSettled(missingCoverIds.map((id) => getNovelDetailPayload(id)))
      const covers: Record<string, string> = {}
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return
        const cover = getCoverUrl(result.value.novel.coverUrl)
        if (!cover) return
        covers[missingCoverIds[index]] = cover
        // 同步回写本地书架，下次进页无需再补拉
        updateShelfCover(missingCoverIds[index], cover)
      })
      return covers
    },
  })
  const shelfItems = useMemo<ShelfBook[]>(() => {
    const covers = coverBackfillQuery.data ?? {}
    return mergedShelf.map((item) =>
      item.coverUrl || !item.novelId || !covers[item.novelId] ? item : { ...item, coverUrl: covers[item.novelId] },
    )
  }, [coverBackfillQuery.data, mergedShelf])

  // 个人封面只使用用户自己设置的封面，不再兜底展示作品封面（避免误显示）
  const recentCoverUrl = currentUser?.profileCoverUrl ?? null

  const readingCount = mergedShelf.length
  const likesCount = useMemo(
    () => authoredPosts.reduce((total, post) => total + post.favoriteCount + post.likeCount, 0),
    [authoredPosts],
  )

  function closePostRegisterPrompt() {
    setPostRegisterPromptVisible(false)
  }

  function openEditDialog() {
    if (!currentUser) {
      return
    }

    setNicknameDraft(currentUser.nickname)
    setBioDraft(currentUser.bio ?? '')
    setProfileError('')
    setEditDialogVisible(true)
  }

  function closeEditDialog() {
    setEditDialogVisible(false)
    setProfileError('')
    setAvatarError('')
  }

  async function readImageAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('读取图片文件失败。'))
      reader.readAsDataURL(file)
    })
  }

  function validateImageFile(file: File, maxSizeMb: number, label: string) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error(`${label}仅支持 PNG、JPG 或 WebP 图片。`)
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`${label}图片不能超过 ${maxSizeMb}MB。`)
    }
  }

  async function uploadAvatar(avatarDataUrl: string | null) {
    const payload = await requestJson<{ user: User }>('/api/users/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify({
        avatarDataUrl,
      } satisfies UpdateMyAvatarRequest),
    })

    syncSessionUser({
      user: payload.user,
      unreadMessageCount,
      unreadNotificationCount,
    })
    await meQuery.refetch()
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setAvatarError('')

    try {
      validateImageFile(file, 2, '头像')
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : '头像文件无效。')
      event.target.value = ''
      return
    }

    setAvatarSubmitting(true)

    try {
      await uploadAvatar(await readImageAsDataUrl(file))
    } catch (error) {
      setAvatarError(error instanceof ApiClientError ? error.message : '暂时无法上传头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
      event.target.value = ''
    }
  }

  async function handleResetAvatar() {
    setAvatarError('')
    setAvatarSubmitting(true)

    try {
      await uploadAvatar(null)
    } catch (error) {
      setAvatarError(error instanceof ApiClientError ? error.message : '暂时无法恢复默认头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
    }
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')

    if (!nicknameDraft.trim()) {
      setProfileError('请输入昵称。')
      return
    }

    setProfileSubmitting(true)

    try {
      const payload = await requestJson<{ user: User }>('/api/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: nicknameDraft.trim(),
          bio: bioDraft.trim(),
        } satisfies UpdateMyProfileRequest),
      })

      syncSessionUser({
        user: payload.user,
        unreadMessageCount,
        unreadNotificationCount,
      })
      await meQuery.refetch()
      closeEditDialog()
    } catch (error) {
      setProfileError(error instanceof ApiClientError ? error.message : '暂时无法保存个人信息，请稍后再试。')
    } finally {
      setProfileSubmitting(false)
    }
  }

  if (meQuery.isLoading || postsQuery.isLoading) {
    return <ProfileSkeleton />
  }

  if (meQuery.isError || !currentUser) {
    return (
      <AppState
        tone="error"
        title="个人中心暂时没有打开"
        description={meQuery.error instanceof Error ? meQuery.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void meQuery.refetch() }}
        className="min-h-[420px]"
      />
    )
  }

  const statsCards = [
    { icon: BookOpen, label: '在读', value: Object.keys(progressMap).length, unit: '本' },
    { icon: Bookmark, label: '书架', value: readingCount, unit: '本' },
    { icon: PenLine, label: '创作', value: visibleAuthoredNovels.length, unit: '部' },
    { icon: FileText, label: '草稿', value: draftItems.length, unit: '篇' },
  ]

  return (
    <>
      <div className="space-y-5 md:space-y-6">
        <ProfileHeader
          user={currentUser}
          coverUrl={recentCoverUrl}
          readingCount={readingCount}
          likesCount={likesCount}
          onEditProfile={openEditDialog}
          onGoSettings={() => navigate('/settings')}
        />

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {statsCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <card.icon className="h-4 w-4 text-[var(--color-brand)]" />
                {card.label}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {card.value}
                <span className="ml-1 text-xs font-normal text-[var(--text-tertiary)]">{card.unit}</span>
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4 shadow-[var(--shadow-card)] sm:px-6 sm:py-5">
          <div className="flex flex-wrap gap-2">
            {panels.map((panel) => {
              const count =
                panel.id === 'shelf' ? mergedShelf.length : panel.id === 'creation' ? visibleAuthoredNovels.length : 0

              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActivePanel(panel.id)}
                  className={[
                    'press-feedback inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-medium transition-colors',
                    activePanel === panel.id
                      ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  {panel.label}
                  <span className="text-xs opacity-75">{count}</span>
                </button>
              )
            })}
          </div>

          {activePanel === 'shelf' ? (
            <div className="mt-5">
              <ShelfPanel
                items={shelfItems}
                progressMap={progressMap}
                onOpenNovel={(novelId) => navigate(`/novel/${novelId}`)}
                onDiscover={() => navigate('/discover')}
              />
            </div>
          ) : null}

          {activePanel === 'creation' ? (
            <div className="mt-5">
              <CreationPanel
                drafts={draftItems}
                novels={visibleAuthoredNovels}
                onOpenStudio={() => navigate('/studio')}
                onOpenNovelStudio={(novelId) => navigate(`/studio/novel/${novelId}`)}
                onOpenNovel={(novelId) => navigate(`/novel/${novelId}`)}
              />
            </div>
          ) : null}

          {activePanel === 'favorites' ? (
            <div className="mt-5">
              <AppState
                tone="empty"
                title="你还没有收藏内容"
                description="看到喜欢的作品后，把它们收进收藏，这里会慢慢变成你的私人精选。"
                primaryAction={{ label: '去发现', onClick: () => navigate('/discover') }}
                className="min-h-[280px]"
              />
            </div>
          ) : null}
        </section>
      </div>

      {editDialogVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[560px] rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 shadow-[var(--shadow-modal)]">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">编辑资料</h3>
              <p className="text-sm leading-7 text-[var(--text-secondary)]">
                在这里修改头像、昵称和简介。封面仍然可以去设置页继续维护。
              </p>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleUpdateProfile}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />

              <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar
                      name={currentUser.nickname}
                      src={currentUser.avatarUrl}
                      size="lg"
                      className="h-20 w-20"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">头像</p>
                      <p className="text-xs leading-6 text-[var(--text-tertiary)]">
                        支持 PNG、JPG、WebP，大小不超过 2MB。
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarSubmitting}
                    >
                      {avatarSubmitting ? '上传中…' : '修改头像'}
                    </Button>
                    {currentUser.avatarUrl ? (
                      <Button type="button" variant="ghost" onClick={handleResetAvatar} disabled={avatarSubmitting}>
                        恢复默认
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {avatarError ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {avatarError}
                </p>
              ) : null}

              {profileError ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {profileError}
                </p>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="profile-edit-nickname">
                  昵称
                </label>
                <TextInput
                  id="profile-edit-nickname"
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  placeholder="请输入昵称"
                  autoComplete="nickname"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="profile-edit-bio">
                  个人简介
                </label>
                <textarea
                  id="profile-edit-bio"
                  value={bioDraft}
                  onChange={(event) => setBioDraft(event.target.value)}
                  placeholder="简单介绍一下你自己"
                  rows={4}
                  className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => navigate('/settings')}>
                  去设置封面
                </Button>
                <Button type="button" variant="secondary" onClick={closeEditDialog} disabled={profileSubmitting}>
                  取消
                </Button>
                <Button type="submit" variant="primary" disabled={profileSubmitting || avatarSubmitting}>
                  {profileSubmitting ? '保存中…' : '保存资料'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {postRegisterPromptVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[420px] rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 shadow-[var(--shadow-modal)]">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">注册成功</h3>
              <p className="text-sm leading-7 text-[var(--text-secondary)]">
                你已经登录成功。现在可以去完善个人信息，也可以先继续看看你的个人中心。
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="button" variant="secondary" onClick={closePostRegisterPrompt}>
                稍后完善
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  closePostRegisterPrompt()
                  navigate('/settings', { replace: true })
                }}
              >
                去完善资料
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
