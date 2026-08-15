/**
 * 设置页隐私设置常量与工具
 * 由 SettingsPage.tsx 模块级抽取而来。
 */
import type { PrivacyLevel, PrivacySettings } from '../../../../shared/contracts'

export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) {
    return '暂未绑定'
  }

  const normalized = phone.replace(/^\+86/, '')

  if (normalized.length < 7) {
    return phone
  }

  return `+86 ${normalized.slice(0, 3)}****${normalized.slice(-4)}`
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  followers: 'public',
  following: 'public',
  likes: 'public',
  favorites: 'public',
  replies: 'public',
}

/** 隐私设置行：5 个维度共用一套三级选项 */
export const PRIVACY_ITEMS: Array<{ key: keyof PrivacySettings; label: string; caption: string }> = [
  { key: 'followers', label: '粉丝列表', caption: '谁可以查看关注你的人' },
  { key: 'following', label: '关注列表', caption: '谁可以查看你关注的人' },
  { key: 'likes', label: '获赞', caption: '谁可以查看你收到的赞' },
  { key: 'favorites', label: '喜欢', caption: '谁可以查看你赞过的帖子' },
  { key: 'replies', label: '已回复', caption: '谁可以查看你发出的评论' },
]

export const PRIVACY_LEVEL_META: Record<PrivacyLevel, { label: string; caption: string }> = {
  public: { label: '公开', caption: '所有人可见' },
  mutual: { label: '仅互相关注', caption: '只有互相关注的人可见' },
  private: { label: '仅自己', caption: '只有你自己可见' },
}

export const PRIVACY_LEVEL_ORDER: PrivacyLevel[] = ['public', 'mutual', 'private']

/** 设置弹窗状态：点开设置项一律弹出自定义弹窗，不再在对应行下方内联展开 */
export type SettingsDialogState =
  | { kind: 'profile' }
  | { kind: 'password' }
  | { kind: 'privacy'; key: keyof PrivacySettings }
  | { kind: 'update' }
  | null
