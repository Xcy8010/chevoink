import { useQuery } from '@tanstack/react-query'
import { Clock3, Settings } from 'lucide-react'
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ApiClientError, requestJson } from '@/app/api-client'
import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { getMe, listNovels, listPosts } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { formatRelativeTime } from '@/features/community/utils'
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

const BOOTSTRAP_NOVEL_TITLE = '我的第一部作品'
const BOOTSTRAP_NOVEL_SUMMARY = '先创建一部作品，再继续完善简介、章节和封面。'

function isBootstrapNovel(novel: {
  title: string
  summary: string
  chapterCount: number
  wordCount: number
}) {
  return (
    novel.title === BOOTSTRAP_NOVEL_TITLE &&
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

  const novelsQuery = useQuery({
    queryKey: ['community', 'novels'],
    queryFn: () => listNovels(40),
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
    if (!currentUser) {
      return []
    }

    return (novelsQuery.data?.items ?? []).filter((novel) => novel.author.id === currentUser.id)
  }, [currentUser, novelsQuery.data?.items])

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

  const shelfItems = mePayload?.shelf ?? []
  const draftItems = useMemo(
    () => (mePayload?.drafts ?? []).filter((draft) => !hiddenBootstrapNovelIds.has(draft.novelId)),
    [hiddenBootstrapNovelIds, mePayload?.drafts],
  )
  const recentCoverUrl =
    currentUser?.profileCoverUrl ??
    mePayload?.recentCoverAsset?.imageUrl ??
    visibleAuthoredNovels[0]?.coverUrl ??
    null

  const readingCount = shelfItems.length
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

  if (meQuery.isLoading || novelsQuery.isLoading || postsQuery.isLoading) {
    return (
      <AppState
        tone="loading"
        title="个人中心正在整理"
        description="稍等一下，你的书架、创作和最近互动很快就会出现。"
        className="min-h-[420px]"
      />
    )
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

  const profileCoverStyle = recentCoverUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.72)), url(${recentCoverUrl})`,
      }
    : undefined

  return (
    <>
      <div className="space-y-5 md:space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950">
          <div
            className="relative min-h-[320px] px-5 pb-5 pt-6 text-white sm:min-h-[360px] sm:px-6 sm:pb-6"
            style={
              profileCoverStyle ?? {
                backgroundImage:
                  'linear-gradient(135deg, rgba(49,46,129,1) 0%, rgba(17,24,39,1) 55%, rgba(30,41,59,1) 100%)',
              }
            }
          >
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/30 to-transparent" />
            <div className="relative flex min-h-[280px] flex-col justify-between gap-6">
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/16"
                >
                  <Settings className="h-4 w-4" />
                  设置封面
                </button>
                <Button variant="secondary" onClick={openEditDialog}>
                  编辑资料
                </Button>
              </div>

              <div className="space-y-5">
                <div className="flex items-end gap-4">
                  <Avatar
                    name={currentUser.nickname}
                    src={currentUser.avatarUrl}
                    size="lg"
                    className="h-20 w-20 border border-white/15 bg-white/10 sm:h-24 sm:w-24"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-[1.9rem] font-semibold tracking-tight sm:text-[2.2rem]">
                        {currentUser.nickname}
                      </h2>
                      <span className="rounded-full bg-white/12 px-3 py-1 text-xs text-white/82 backdrop-blur">
                        {currentUser.isAuthor ? '创作者身份' : '读者身份'}
                      </span>
                    </div>
                    <p className="max-w-2xl text-sm leading-7 text-white/82">
                      {currentUser.bio || '先把简介补完整，让其他人更容易认识你，也更容易记住你正在读和正在写什么。'}
                    </p>
                    <p className="text-sm text-white/68">
                      阅读 {readingCount} 本 · 粉丝 {currentUser.followerCount} · 获赞 {likesCount}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 rounded-[28px] bg-white/10 p-3 backdrop-blur md:max-w-[560px]">
                  <div className="rounded-[20px] bg-white/10 px-4 py-3">
                    <p className="text-xs text-white/68">阅读</p>
                    <p className="mt-2 text-2xl font-semibold">{readingCount}</p>
                  </div>
                  <div className="rounded-[20px] bg-white/10 px-4 py-3">
                    <p className="text-xs text-white/68">粉丝</p>
                    <p className="mt-2 text-2xl font-semibold">{currentUser.followerCount}</p>
                  </div>
                  <div className="rounded-[20px] bg-white/10 px-4 py-3">
                    <p className="text-xs text-white/68">获赞</p>
                    <p className="mt-2 text-2xl font-semibold">{likesCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950 sm:px-6 sm:py-5">
          <div className="flex flex-wrap gap-2">
            {panels.map((panel) => {
              const count =
                panel.id === 'shelf' ? shelfItems.length : panel.id === 'creation' ? visibleAuthoredNovels.length + draftItems.length : 0

              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActivePanel(panel.id)}
                  className={[
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                    activePanel === panel.id
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50',
                  ].join(' ')}
                >
                  {panel.label}
                  <span className="text-xs opacity-72">{count}</span>
                </button>
              )
            })}
          </div>

          {activePanel === 'shelf' ? (
            <div className="mt-5">
              {shelfItems.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {shelfItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.novelId && navigate(`/novel/${item.novelId}`)}
                      className="text-left"
                    >
                      <div className="overflow-hidden rounded-[22px] bg-slate-50 p-2 transition hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            className="aspect-[3/4] w-full rounded-[16px] object-cover"
                          />
                        ) : (
                          <div className="aspect-[3/4] rounded-[16px] bg-slate-200 dark:bg-slate-800" />
                        )}
                        <div className="px-1 pb-1 pt-3">
                          <p className="line-clamp-2 text-sm font-medium leading-6 text-slate-950 dark:text-slate-50">
                            {item.title}
                          </p>
                          <p className="mt-2 line-clamp-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                            {item.summary || '继续回到正文阅读。'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <AppState
                  tone="empty"
                  title="你的书架还是空的"
                  description="先去发现页找一本感兴趣的书，之后这里会自动出现你的阅读记录。"
                  primaryAction={{ label: '去发现', onClick: () => navigate('/discover') }}
                  className="min-h-[280px]"
                />
              )}
            </div>
          ) : null}

          {activePanel === 'creation' ? (
            <div className="mt-5 space-y-5">
              {draftItems.length > 0 ? (
                <div className="rounded-[26px] bg-slate-50 p-4 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                    <Clock3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    最近草稿
                  </div>
                  <div className="mt-4 space-y-3">
                    {draftItems.slice(0, 3).map((draft) => (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => navigate(`/studio/novel/${draft.novelId}`)}
                        className="flex w-full items-center justify-between rounded-[18px] bg-white px-4 py-3 text-left transition hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-950 dark:text-slate-50">
                            {draft.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                            {draft.summary}
                          </span>
                        </span>
                        <span className="ml-4 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          {formatRelativeTime(draft.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {visibleAuthoredNovels.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleAuthoredNovels.map((novel) => (
                    <article key={novel.id} className="rounded-[24px] bg-slate-50 p-3 dark:bg-slate-900">
                      {novel.coverUrl ? (
                        <img
                          src={novel.coverUrl}
                          alt={novel.title}
                          className="aspect-[3/4] w-full rounded-[18px] object-cover"
                        />
                      ) : (
                        <div className="aspect-[3/4] rounded-[18px] bg-slate-200 dark:bg-slate-800" />
                      )}
                      <div className="px-1 pb-1 pt-3">
                        <p className="line-clamp-2 text-sm font-medium leading-6 text-slate-950 dark:text-slate-50">
                          {novel.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {novel.chapterCount} 章 · {novel.wordCount} 字
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/novel/${novel.id}`)}>
                            查看
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => navigate(`/studio/novel/${novel.id}`)}>
                            继续写
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <AppState
                  tone="empty"
                  title="你还没有创作内容"
                  description="从创作中心开始第一部作品，这里会同步展示你的作品和草稿。"
                  primaryAction={{ label: '开始创作', onClick: () => navigate('/studio') }}
                  className="min-h-[280px]"
                />
              )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] dark:bg-black/60">
          <div className="w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-slate-950 dark:text-slate-50">编辑资料</h3>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
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

              <div className="rounded-[24px] bg-slate-50 p-4 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar
                      name={currentUser.nickname}
                      src={currentUser.avatarUrl}
                      size="lg"
                      className="h-20 w-20 sm:h-24 sm:w-24"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-950 dark:text-slate-50">头像</p>
                      <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
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
                <p className="rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {avatarError}
                </p>
              ) : null}

              {profileError ? (
                <p className="rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {profileError}
                </p>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-950 dark:text-slate-50" htmlFor="profile-edit-nickname">
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
                <label className="text-sm font-medium text-slate-950 dark:text-slate-50" htmlFor="profile-edit-bio">
                  个人简介
                </label>
                <textarea
                  id="profile-edit-bio"
                  value={bioDraft}
                  onChange={(event) => setBioDraft(event.target.value)}
                  placeholder="简单介绍一下你自己"
                  rows={4}
                  className="w-full resize-none rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-slate-700 dark:focus:ring-slate-800"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] dark:bg-black/60">
          <div className="w-full max-w-[420px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)] dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-slate-950 dark:text-slate-50">注册成功</h3>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
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
