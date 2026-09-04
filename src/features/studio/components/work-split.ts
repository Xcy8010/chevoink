export const WORK_SPLIT = { chat: 360, viewer: 320, inspector: 260, rail: 46, conversationRail: 44, hysteresis: 24 }
export type WorkSplit = { viewer: number; inspector: number; chatCollapsed: boolean; viewerCollapsed: boolean; inspectorCollapsed: boolean }
export type WorkSplitGeometry = WorkSplit & { chat: number; rail: number }

/** Always resolve against the measured workspace, not the full screen / assumed sidebar width. */
export function fitWorkSplit(state: WorkSplit, width: number, hasViewer: boolean): WorkSplitGeometry {
  const room = Math.max(0, width)
  const chatCollapsed = state.chatCollapsed
  const chatReserve = chatCollapsed ? 0 : WORK_SPLIT.chat + WORK_SPLIT.conversationRail
  const viewerCollapsed = state.viewerCollapsed || (!chatCollapsed && room < chatReserve + WORK_SPLIT.viewer + WORK_SPLIT.rail)
  const viewerOpen = hasViewer && !viewerCollapsed
  const availableInspector = room - chatReserve - (viewerOpen ? WORK_SPLIT.viewer : 0)
  const inspectorCollapsed = state.inspectorCollapsed || availableInspector < WORK_SPLIT.inspector
  let inspector = inspectorCollapsed ? Math.min(room, WORK_SPLIT.rail) : Math.min(Math.max(WORK_SPLIT.inspector, state.inspector), availableInspector)
  const rail = chatCollapsed ? 0 : WORK_SPLIT.conversationRail
  if (chatCollapsed) inspector = Math.min(inspector, Math.max(WORK_SPLIT.rail, room - (viewerOpen ? WORK_SPLIT.viewer : 0)))
  const viewer = viewerOpen ? chatCollapsed ? Math.max(0, room - inspector) : Math.min(Math.max(WORK_SPLIT.viewer, state.viewer), room - rail - WORK_SPLIT.chat - inspector) : 0
  return { ...state, inspector, viewer, rail, chatCollapsed, viewerCollapsed, inspectorCollapsed, chat: chatCollapsed ? 0 : Math.max(0, room - rail - viewer - inspector) }
}

/** Pure gesture mapping. The immutable start snapshot survives every fold/unfold. */
export function resizeWorkSplit(start: WorkSplitGeometry, previous: WorkSplit, width: number, delta: number, boundary: 'content' | 'inspector', hasViewer: boolean): WorkSplit {
  const { chat, viewer, inspector, hysteresis, rail, conversationRail } = WORK_SPLIT
  if (boundary === 'inspector') {
    const raw = (start.inspectorCollapsed ? inspector : start.inspector) - delta
    const folded = raw < inspector + (previous.inspectorCollapsed ? hysteresis : -hysteresis)
    const nextInspector = folded ? rail : Math.max(inspector, Math.min(width - viewer, raw))
    const nextViewer = hasViewer && !start.viewerCollapsed ? Math.max(viewer, start.viewer + start.inspector - nextInspector) : 0
    const nextChat = width - conversationRail - nextInspector - nextViewer
    return { ...start, inspector: nextInspector, viewer: nextViewer, inspectorCollapsed: folded, chatCollapsed: nextChat < chat - hysteresis || start.chatCollapsed }
  }
  if (!hasViewer) {
    // Without a viewer the same boundary separates conversation and inspector.
    const startingChat = start.chatCollapsed ? chat : start.inspectorCollapsed ? width - conversationRail - inspector : start.chat
    const rawChat = startingChat + delta
    const foldedChat = rawChat < chat + (previous.chatCollapsed ? hysteresis : -hysteresis)
    const rawInspector = width - conversationRail - rawChat
    const foldedInspector = rawInspector < inspector + (previous.inspectorCollapsed ? hysteresis : -hysteresis)
    return { ...start, chatCollapsed: foldedChat, inspectorCollapsed: foldedInspector, inspector: foldedInspector ? rail : Math.max(inspector, rawInspector) }
  }
  const startingPairFolded = start.viewerCollapsed && start.inspectorCollapsed
  const independentInspectorFolded = start.inspectorCollapsed && !start.viewerCollapsed
  const minimumInspector = independentInspectorFolded ? rail : inspector
  const rawGroup = startingPairFolded ? viewer + inspector - delta : start.chatCollapsed ? width - conversationRail - chat - delta : start.viewer + start.inspector - delta
  const rawChat = width - conversationRail - rawGroup
  const foldedChat = rawChat < chat + (previous.chatCollapsed ? hysteresis : -hysteresis)
  const foldedPair = rawGroup < viewer + minimumInspector + (previous.viewerCollapsed && previous.inspectorCollapsed ? hysteresis : -hysteresis)
  if (foldedPair && !foldedChat) return { ...start, chatCollapsed: false, viewerCollapsed: true, inspectorCollapsed: true }
  const fixedInspector = start.inspectorCollapsed ? minimumInspector : Math.max(inspector, start.inspector)
  // First shrink the viewer; only after its minimum do we start shrinking the inspector.
  const nextInspector = Math.max(minimumInspector, Math.min(fixedInspector, rawGroup - viewer))
  return { viewer: Math.max(viewer, rawGroup - nextInspector), inspector: nextInspector, chatCollapsed: foldedChat, viewerCollapsed: false, inspectorCollapsed: independentInspectorFolded }
}
