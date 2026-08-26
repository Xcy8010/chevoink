const ACTIVITY_DOCK_WIDTH = 296
const MIN_CONVERSATION_WIDTH_WITH_DOCK = 920

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
