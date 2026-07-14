export const communityPrompts = [
  '聊聊你最近最想继续追的一章',
  '分享一个最近写得很稳的章节节点',
  '记录一次让你决定继续读下去的人物关系',
]

export const conversationFilters = [
  { id: 'all', label: '全部会话' },
  { id: 'unread', label: '未读优先' },
  { id: 'direct', label: '私聊' },
] as const
