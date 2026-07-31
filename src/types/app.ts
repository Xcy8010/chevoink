export type ThemeMode = 'light' | 'dark'

export type NavItem = {
  label: string
  href: string
}

export type QuickCreateAction = {
  title: string
  description: string
  href: string
}

export const desktopNavItems: NavItem[] = [
  { label: '发现', href: '/discover' },
  { label: '创作', href: '/studio' },
  { label: '社区', href: '/community' },
]

export const mobileNavItems: NavItem[] = [
  { label: '发现', href: '/' },
  { label: '消息', href: '/messages' },
  { label: '社区', href: '/community' },
  { label: '我的', href: '/me' },
]

export const workspaceLinks: NavItem[] = [
  { label: '首页', href: '/' },
  { label: '发现', href: '/discover' },
  { label: '创作', href: '/studio' },
  { label: '社区', href: '/community' },
  { label: '消息', href: '/messages' },
  { label: '我的', href: '/me' },
]

export const quickCreateActions: QuickCreateAction[] = [
  {
    title: 'AI 创作',
    description: '生成大纲、片段灵感和角色设定，让写作更快进入状态。',
    href: '/studio',
  },
  {
    title: '新建小说',
    description: '创建一本新作品，整理书名、简介和章节结构。',
    href: '/studio',
  },
  {
    title: '写新章节',
    description: '从当前作品继续往下写，把灵感尽快落成正文。',
    href: '/studio',
  },
  {
    title: '发布帖子',
    description: '把创作动态、读后感和讨论发到社区里。',
    href: '/community',
  },
]
