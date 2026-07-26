import { Settings } from 'lucide-react'

import Button from '@/components/ui/Button'
import Avatar from '@/features/community/components/Avatar'
import type { User } from '../../../../shared/contracts'

type ProfileHeaderProps = {
  user: User
  coverUrl: string | null
  readingCount: number
  likesCount: number
  onEditProfile: () => void
  onGoSettings: () => void
}

/** 个人中心头部：封面渐变遮罩 + 头像 + 昵称 + 数据行 */
export default function ProfileHeader({
  user,
  coverUrl,
  readingCount,
  likesCount,
  onEditProfile,
  onGoSettings,
}: ProfileHeaderProps) {
  const coverStyle = coverUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.72)), url(${coverUrl})`,
      }
    : {
        backgroundImage: 'linear-gradient(135deg, #28435f 0%, #16233a 58%, #1f2f47 100%)',
      }

  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[var(--shadow-card)]">
      <div className="relative min-h-[300px] px-5 pb-5 pt-5 text-white sm:min-h-[340px] sm:px-6 sm:pb-6" style={coverStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="relative flex min-h-[264px] flex-col justify-between gap-6 sm:min-h-[300px]">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              onClick={onGoSettings}
              className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/16"
            >
              <Settings className="h-4 w-4" />
              设置封面
            </button>
            <Button variant="secondary" onClick={onEditProfile}>
              编辑资料
            </Button>
          </div>

          <div className="space-y-5">
            <div className="flex items-end gap-4">
              <Avatar
                name={user.nickname}
                src={user.avatarUrl}
                size="lg"
                className="h-20 w-20 border-2 border-white/25 bg-white/10"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold tracking-tight sm:text-[1.75rem]">{user.nickname}</h2>
                  <span className="rounded-[var(--radius-pill)] bg-white/12 px-3 py-1 text-xs text-white/85 backdrop-blur">
                    {user.isAuthor ? '创作者身份' : '读者身份'}
                  </span>
                </div>
                <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-white/82">
                  {user.bio || '先把简介补完整，让其他人更容易认识你，也更容易记住你正在读和正在写什么。'}
                </p>
                <p className="text-sm text-white/70">
                  阅读 {readingCount} 本 · 粉丝 {user.followerCount} · 获赞 {likesCount}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-[var(--radius-xl)] bg-white/10 p-3 backdrop-blur md:max-w-[560px]">
              <div className="rounded-[var(--radius-lg)] bg-white/10 px-4 py-3">
                <p className="text-xs text-white/70">阅读</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums">{readingCount}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white/10 px-4 py-3">
                <p className="text-xs text-white/70">粉丝</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums">{user.followerCount}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white/10 px-4 py-3">
                <p className="text-xs text-white/70">获赞</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums">{likesCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
