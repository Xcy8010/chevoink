/**
 * 分享到社区的草稿（任务7）：
 * 作品页/作者页点击「分享到社区」后，经 router state 带入社区页，
 * 由 PostComposer 自动展开并在输入框下方预览对应卡片。
 */
export type CommunityShareDraft =
  | {
      kind: 'novel'
      novel: { id: string; title: string; coverUrl: string | null }
    }
  | {
      kind: 'author'
      author: { id: string; nickname: string; avatarUrl: string | null; bio: string | null }
    }

/** 从 router state 中安全读取分享草稿（state 可能是任意历史遗留结构） */
export function readShareDraftFromState(state: unknown): CommunityShareDraft | null {
  if (!state || typeof state !== 'object' || !('share' in state)) {
    return null
  }

  const share = (state as { share?: unknown }).share
  if (!share || typeof share !== 'object' || !('kind' in share)) {
    return null
  }

  const draft = share as CommunityShareDraft
  if (draft.kind === 'novel' && draft.novel?.id) {
    return draft
  }
  if (draft.kind === 'author' && draft.author?.id) {
    return draft
  }

  return null
}
