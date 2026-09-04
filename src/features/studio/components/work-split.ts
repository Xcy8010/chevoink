export const WORK_SPLIT = { chat: 360, viewer: 240, inspector: 200, rail: 46, conversationRail: 44, hysteresis: 24, foldResistance: 72 }
export type WorkSplit = { viewer: number; inspector: number; chatCollapsed: boolean; viewerCollapsed: boolean; inspectorCollapsed: boolean }
export type WorkSplitGeometry = WorkSplit & { chat: number; rail: number }

/** Always resolve against the measured workspace, not the full screen / assumed sidebar width. */
export function fitWorkSplit(state: WorkSplit, width: number, hasViewer: boolean): WorkSplitGeometry {
  const room = Math.max(0, width)
  // Never leave an empty canvas after the last content pane disappears.
  const chatCollapsed = state.chatCollapsed && (hasViewer && !state.viewerCollapsed || !state.inspectorCollapsed)
  const chatReserve = chatCollapsed ? 0 : WORK_SPLIT.chat + WORK_SPLIT.conversationRail
  const viewerCollapsed = state.viewerCollapsed || (!chatCollapsed && room < chatReserve + WORK_SPLIT.viewer + WORK_SPLIT.rail)
  const viewerOpen = hasViewer && !viewerCollapsed
  const availableInspector = room - chatReserve - (viewerOpen ? WORK_SPLIT.viewer : 0)
  const inspectorCollapsed = state.inspectorCollapsed || availableInspector < WORK_SPLIT.inspector
  let inspector = inspectorCollapsed ? Math.min(room, WORK_SPLIT.rail) : Math.min(Math.max(WORK_SPLIT.inspector, state.inspector), availableInspector)
  const rail = chatCollapsed ? 0 : WORK_SPLIT.conversationRail
  if (chatCollapsed) inspector = viewerOpen ? Math.min(inspector, Math.max(WORK_SPLIT.rail, room - WORK_SPLIT.viewer)) : room
  const viewer = viewerOpen ? chatCollapsed ? Math.max(0, room - inspector) : Math.min(Math.max(WORK_SPLIT.viewer, state.viewer), room - rail - WORK_SPLIT.chat - inspector) : 0
  return { ...state, inspector, viewer, rail, chatCollapsed, viewerCollapsed, inspectorCollapsed, chat: chatCollapsed ? 0 : Math.max(0, room - rail - viewer - inspector) }
}

/** Pure gesture mapping. The immutable start snapshot survives every fold/unfold. */
export function resizeWorkSplit(start: WorkSplitGeometry, previous: WorkSplit, width: number, delta: number, boundary: 'content' | 'inspector', hasViewer: boolean): WorkSplit {
  const { chat, viewer, inspector, hysteresis, foldResistance, rail, conversationRail } = WORK_SPLIT
  if (boundary === 'inspector') {
    const raw = (start.inspectorCollapsed ? inspector : start.inspector) - delta
    const folded = raw < inspector + (previous.inspectorCollapsed ? hysteresis : -foldResistance)
    const nextInspector = folded ? rail : Math.max(inspector, Math.min(width - viewer, raw))
    const nextViewer = hasViewer && !start.viewerCollapsed ? Math.max(viewer, start.viewer + start.inspector - nextInspector) : 0
    const nextChat = width - conversationRail - nextInspector - nextViewer
    return { ...start, inspector: nextInspector, viewer: nextViewer, inspectorCollapsed: folded, chatCollapsed: !folded && (nextChat < chat - foldResistance || start.chatCollapsed) }
  }
  if (!hasViewer) {
    // Without a viewer the same boundary separates conversation and inspector.
    const startingChat = start.chatCollapsed ? chat : start.inspectorCollapsed ? width - conversationRail - inspector : start.chat
    const rawChat = startingChat + delta
    const foldedChat = rawChat < chat + (previous.chatCollapsed ? hysteresis : -foldResistance)
    const rawInspector = width - conversationRail - rawChat
    const foldedInspector = rawInspector < inspector + (previous.inspectorCollapsed ? hysteresis : -foldResistance)
    return { ...start, chatCollapsed: foldedChat, inspectorCollapsed: foldedInspector, inspector: foldedInspector ? rail : Math.max(inspector, rawInspector) }
  }
  const startingPairFolded = start.viewerCollapsed && start.inspectorCollapsed
  const independentInspectorFolded = start.inspectorCollapsed && !start.viewerCollapsed
  const minimumInspector = independentInspectorFolded ? rail : inspector
  const rawGroup = startingPairFolded ? viewer + inspector - delta : start.chatCollapsed ? width - conversationRail - chat - delta : start.viewer + start.inspector - delta
  const rawChat = width - conversationRail - rawGroup
  const foldedChat = rawChat < chat + (previous.chatCollapsed ? hysteresis : -foldResistance)
  const foldedPair = rawGroup < viewer + minimumInspector + (previous.viewerCollapsed && previous.inspectorCollapsed ? hysteresis : -foldResistance)
  if (foldedPair && !foldedChat) return { ...start, chatCollapsed: false, viewerCollapsed: true, inspectorCollapsed: true }
  const fixedInspector = start.inspectorCollapsed ? minimumInspector : Math.max(inspector, start.inspector)
  // First shrink the viewer; only after its minimum do we start shrinking the inspector.
  const nextInspector = Math.max(minimumInspector, Math.min(fixedInspector, rawGroup - viewer))
  return { viewer: Math.max(viewer, rawGroup - nextInspector), inspector: nextInspector, chatCollapsed: foldedChat, viewerCollapsed: false, inspectorCollapsed: independentInspectorFolded }
}

export type WorkSplitGesture = { x: number; start: WorkSplitGeometry; width: number; boundary: 'content' | 'inspector'; hasViewer: boolean }

/** Re-anchor at a fold and follow overshoot, so reversal never has to retrace dead travel. */
export function advanceWorkSplitGesture(gesture: WorkSplitGesture, previous: WorkSplit, x: number): WorkSplit {
  const next = resizeWorkSplit(gesture.start, previous, gesture.width, x - gesture.x, gesture.boundary, gesture.hasViewer)
  const changed = next.chatCollapsed !== previous.chatCollapsed || next.viewerCollapsed !== previous.viewerCollapsed || next.inspectorCollapsed !== previous.inspectorCollapsed
  const foldedTowardLeft = gesture.boundary === 'content' && next.chatCollapsed
  const foldedTowardRight = gesture.boundary === 'inspector' ? next.inspectorCollapsed : next.inspectorCollapsed && (!gesture.hasViewer || next.viewerCollapsed)
  if (changed || foldedTowardLeft && x < gesture.x || foldedTowardRight && x > gesture.x) {
    gesture.x = x
    gesture.start = fitWorkSplit(next, gesture.width, gesture.hasViewer)
  }
  return next
}
