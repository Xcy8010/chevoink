const ACTIVITY_DOCK_WIDTH = 296
const MIN_CONVERSATION_WIDTH_WITH_DOCK = 920

/**
 * 外层侧栏折叠后停靠卡改悬浮（对话列在整个视口居中）所需的最低净宽：
 * 居中对话列（最大 896）与悬浮停靠卡不重叠的条件为 containerWidth - rightWidth ≥ 1556；
 * 窗口更窄时保持流内布局（对话列居中于扣除停靠卡后的区域），宁可偏左也不互相遮挡。
 */
export const FLOATING_DOCK_MIN_CLEARANCE = 1556

/** 仅在右侧任务状态不会挤压主对话区时启用独立停靠卡。 */
export function shouldShowWorkActivityDock({
  containerWidth,
  leftWidth,
  rightWidth,
  hasActivity,
  hasViewer,
}: {
  containerWidth: number
  leftWidth: number
  rightWidth: number
  hasActivity: boolean
  hasViewer: boolean
}) {
  if (!hasActivity || hasViewer) return false
  return containerWidth - leftWidth - rightWidth - ACTIVITY_DOCK_WIDTH >= MIN_CONVERSATION_WIDTH_WITH_DOCK
}
