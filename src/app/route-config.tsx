import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'

import AuthPage from '@/app/routes/AuthPage'
import NotFoundPage from '@/app/routes/NotFoundPage'
import RequireAuthRoute from '@/app/routes/RequireAuthRoute'
import SettingsPage from '@/app/routes/SettingsPage'
import AuthorPage from '@/pages/AuthorPage'
import CommunityPage from '@/pages/CommunityPage'
import DiscoverPage from '@/pages/DiscoverPage'
import Home from '@/pages/Home'
import MessagesPage from '@/pages/MessagesPage'
import NovelDetailPage from '@/pages/NovelDetailPage'
import PostDetailPage from '@/pages/PostDetailPage'
import ProfilePage from '@/pages/ProfilePage'
import RankingsPage from '@/pages/RankingsPage'
import ReaderPage from '@/pages/ReaderPage'
import SearchPage from '@/pages/SearchPage'
import StudioPage from '@/pages/StudioPage'

export type AppRouteDefinition = {
  path: string
  title: string
  description: string
  element: ReactElement
  useShell?: boolean
}

export const appRoutes: AppRouteDefinition[] = [
  {
    path: '/',
    title: '继续阅读、发现新书，或者直接开始创作',
    description: '在同一页切换阅读、发现与创作，让每天的内容节奏更顺手。',
    element: <Home />,
  },
  {
    path: '/discover',
    title: '按题材、节奏和口味找到下一本想读的书',
    description: '从分类、榜单和书单里快速缩小范围，把更多时间留给正文。',
    element: <DiscoverPage />,
  },
  {
    path: '/rankings',
    title: '完整榜单：看看大家都在读什么',
    description: '热读、人气、新书、更新、长篇、完结六大榜单，再加玄幻、科幻等分类榜，按排名挑下一本想读的书。',
    element: <RankingsPage />,
  },
  {
    path: '/search',
    title: '搜索作品、作者与讨论',
    description: '输入关键词，在全站范围内找到想读的书、想关注的作者和感兴趣的讨论。',
    element: <SearchPage />,
  },
  {
    path: '/novel/:novelId',
    title: '先了解这部作品，再决定要不要一口气读下去',
    description: '书名、简介、目录和互动信息都收在同一页，帮助你更快做阅读决定。',
    element: <NovelDetailPage />,
  },
  {
    path: '/novel/:novelId/read/:chapterId',
    title: '沉下心，把这一章安静读完',
    description: '正文始终保持在视觉中心，让切换章节、目录和评论都更自然。',
    element: <ReaderPage />,
  },
  {
    path: '/studio',
    title: '从灵感整理到章节成稿，都能在这里顺着写下去',
    description: '在创作中心集中处理作品信息、章节草稿、AI 辅助写作和封面挑选，保持思路不断线。',
    element: (
      <RequireAuthRoute
        title="登录后即可进入创作中心"
        description="登录后，你就可以继续整理灵感、编辑章节并管理自己的作品。"
      >
        <StudioPage />
      </RequireAuthRoute>
    ),
  },
  {
    path: '/studio/novel/:novelId',
    title: '围绕单部作品继续创作、调整和发布',
    description: '聚焦当前作品的章节推进、内容润色和封面选择，让每一步都更连贯。',
    element: (
      <RequireAuthRoute
        title="登录后即可继续这部作品的创作"
        description="登录后，你可以回到当前作品，继续编辑章节、整理内容并准备发布。"
      >
        <StudioPage />
      </RequireAuthRoute>
    ),
  },
  {
    path: '/community',
    title: '看看大家正在聊什么，也把你的想法发出来',
    description: '创作动态、读后讨论和作品话题都集中在这里，让交流更自然发生。',
    element: <CommunityPage />,
  },
  {
    path: '/messages',
    title: '消息中心',
    description: '在这里查看私聊、互动提醒和更新通知，不错过与你有关的内容。',
    element: <MessagesPage />,
  },
  {
    path: '/me',
    title: '管理书架、阅读记录和个人资料',
    description: '把常看的作品、最近的动态和个人信息收进同一个账户中心。',
    element: (
      <RequireAuthRoute
        title="登录后即可查看你的个人中心"
        description="登录后，你的书架、草稿和最近互动都会继续保留。"
      >
        <ProfilePage />
      </RequireAuthRoute>
    ),
  },
  {
    path: '/author/:authorId',
    title: '认识这位作者，也看看他正在写什么',
    description: '在作者主页里集中浏览简介、作品和最近动态，决定要不要继续关注。',
    element: <AuthorPage />,
  },
  {
    path: '/post/:postId',
    title: '继续读完这条讨论，看看大家都在回应什么',
    description: '帖子正文、上下文和互动内容会被收在一起，阅读讨论更连贯。',
    element: <PostDetailPage />,
  },
  {
    path: '/settings',
    title: '调整显示方式、阅读偏好与账户设置',
    description: '把常用偏好整理在一起，让阅读和创作始终保持熟悉的手感。',
    element: <SettingsPage />,
  },
  {
    path: '/login',
    title: '登录启创墨域，继续你的阅读和创作',
    description: '回到书架、草稿和互动记录，把上一次停下的地方接起来。',
    element: <AuthPage mode="login" />,
  },
  {
    path: '/register',
    title: '创建你的启创墨域账户，开始写作和阅读',
    description: '注册后即可收藏作品、发布内容，并把灵感整理成自己的小说。',
    element: <AuthPage mode="register" />,
  },
  {
    path: '/create',
    title: '',
    description: '',
    element: <Navigate to="/studio" replace />,
    useShell: false,
  },
  {
    path: '*',
    title: '你访问的页面没有找到',
    description: '换个入口继续浏览，或者回到首页开始阅读与创作。',
    element: <NotFoundPage />,
  },
]
