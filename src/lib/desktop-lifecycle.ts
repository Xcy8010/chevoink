import { isWindowsDesktopApp } from './desktop-app'

type SaveParticipant = () => boolean | Promise<boolean>
const participants = new Set<SaveParticipant>()
let installed = false
let busy = false

/** Only mounted Windows editors participate; no changes to Web/Android save semantics. */
export function registerDesktopSave(participant: SaveParticipant): () => void {
  if (!isWindowsDesktopApp()) return () => {}
  participants.add(participant)
  return () => { participants.delete(participant) }
}

export async function flushDesktopSaves(): Promise<boolean> {
  // First flush component-local inputs, then allow React to publish owning refs.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  window.dispatchEvent(new Event('chevoink:desktop-flush-input'))
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  const owners = [...participants]
  const results = await Promise.all(owners.map(async (save) => {
    try { return await save() } catch { return false }
  }))
  // A route change during the handshake invalidates the acknowledgement.
  return owners.length === participants.size && owners.every((owner) => participants.has(owner)) && results.every(Boolean)
}

export function setupDesktopLifecycle(): void {
  if (!isWindowsDesktopApp() || installed) return
  installed = true
  window.addEventListener('chevoink:desktop-save', (event) => {
    const nonce: unknown = (event as CustomEvent<{ nonce?: unknown }>).detail?.nonce
    if (busy || typeof nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(nonce)) return
    busy = true
    void (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const saved = await Promise.race([
          flushDesktopSaves(),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 7500) }),
        ])
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('desktop_report_state', { report: { nonce, saved, recording: false } })
      } catch { /* The native host times out safely and offers to stay. */ }
      finally { clearTimeout(timer); busy = false }
    })()
  })
}
