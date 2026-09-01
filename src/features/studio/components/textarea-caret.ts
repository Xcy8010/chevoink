type TextareaSnapshot = {
  start: number
  end: number
  direction: HTMLTextAreaElement['selectionDirection']
  scrollTop: number
  scrollLeft: number
  frame: number
}

const pendingSnapshots = new WeakMap<HTMLTextAreaElement, TextareaSnapshot>()

/**
 * 受控 textarea 的父级状态回写可能发生在浏览器恢复选区之后，导致光标或滚动位置跳到末尾。
 * 输入事件里先拍下当前位置，再在 React 提交后的下一帧恢复，且只影响仍保持焦点的同一编辑器。
 */
export function preserveTextareaCaret(target: HTMLTextAreaElement) {
  const previous = pendingSnapshots.get(target)
  if (previous) window.cancelAnimationFrame(previous.frame)

  const snapshot: TextareaSnapshot = {
    start: target.selectionStart ?? 0,
    end: target.selectionEnd ?? 0,
    direction: target.selectionDirection,
    scrollTop: target.scrollTop,
    scrollLeft: target.scrollLeft,
    frame: 0,
  }
  snapshot.frame = window.requestAnimationFrame(() => {
    if (pendingSnapshots.get(target) !== snapshot) return
    pendingSnapshots.delete(target)
    if (!target.isConnected || document.activeElement !== target) return
    const length = target.value.length
    target.setSelectionRange(Math.min(snapshot.start, length), Math.min(snapshot.end, length), snapshot.direction)
    target.scrollTop = snapshot.scrollTop
    target.scrollLeft = snapshot.scrollLeft
  })
  pendingSnapshots.set(target, snapshot)
}
