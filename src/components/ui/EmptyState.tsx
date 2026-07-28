import type { ReactNode } from 'react'
import { BookOpen, MessageSquare, PenSquare, Search, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

type EmptyStateScene = 'shelf' | 'messages' | 'works' | 'search' | 'comments' | 'generic'

type EmptyStateProps = {
  scene?: EmptyStateScene
  title?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
  icon?: ReactNode
}

const sceneDefaults: Record<EmptyStateScene, { icon: LucideIcon; title: string; description: string }> = {
  shelf: {
    icon: BookOpen,
    title: '书架还空着',
    description: '去发现一本好书，把它放进书架慢慢读。',
  },
  messages: {
    icon: MessageSquare,
    title: '还没有人找你聊天',
    description: '去社区看看大家正在聊什么。',
  },
  works: {
    icon: PenSquare,
    title: '开始创作你的第一部作品',
    description: '从一个书名、一段简介开始，慢慢展开你的世界。',
  },
  search: {
    icon: Search,
    title: '没有找到相关内容',
    description: '换个关键词试试，或者去发现页逛逛。',
  },
  comments: {
    icon: MessageSquare,
    title: '来写下第一条评论吧',
    description: '你的想法会让这部作品更完整。',
  },
  generic: {
    icon: BookOpen,
    title: '这里还没有内容',
    description: '换个时间再来看看。',
  },
}

/** 统一空状态：图标 + 文案 + 可选 CTA */
export default function EmptyState({ scene = 'generic', title, description, action, className, icon }: EmptyStateProps) {
  const defaults = sceneDefaults[scene]
  const Icon = defaults.icon

  return (
    <div
      className={cn(
        // 空态不再画虚线边框容器，图标+文案直接融入页面背景
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-tertiary)]">
        {icon ?? <Icon className="h-6 w-6" />}
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold text-[var(--text-primary)]">{title ?? defaults.title}</p>
        <p className="text-sm text-[var(--text-secondary)]">{description ?? defaults.description}</p>
      </div>
      {action ? (
        action.href ? (
          <Link
            to={action.href}
            className="press-feedback mt-1 inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-5 text-sm font-medium text-[var(--text-contrast)] transition-colors hover:bg-[var(--surface-contrast-hover)]"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="press-feedback mt-1 inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-5 text-sm font-medium text-[var(--text-contrast)] transition-colors hover:bg-[var(--surface-contrast-hover)]"
          >
            {action.label}
          </button>
        )
      ) : null}
    </div>
  )
}
