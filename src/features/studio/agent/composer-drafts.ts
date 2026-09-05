import { useAgentStore } from './agentStore'

type State = ReturnType<typeof useAgentStore.getState>
type Draft = Pick<State, 'composerDraft' | 'composerAttachments' | 'composerReferences' | 'composerSkillIds' | 'composerUploading'>
const prefix = 'chevoink:task-draft:v1:'
const cache = new Map<string, Draft>()
const aliases = new Map<string, string>()
let active: string | undefined
const empty = (): Draft => ({ composerDraft: '', composerAttachments: [], composerReferences: [], composerSkillIds: [], composerUploading: 0 })
const pick = (state: State): Draft => ({ composerDraft: state.composerDraft, composerAttachments: state.composerAttachments, composerReferences: state.composerReferences, composerSkillIds: state.composerSkillIds, composerUploading: state.composerUploading })
const resolve = (scope: string): string => aliases.get(scope) ?? scope
function read(scope: string): Draft {
  if (cache.has(scope)) return cache.get(scope)!
  try {
    const value = JSON.parse(localStorage.getItem(prefix + scope) || 'null')
    if (value && typeof value.composerDraft === 'string' && Array.isArray(value.composerReferences) && Array.isArray(value.composerAttachments) && Array.isArray(value.composerSkillIds)) {
      return { ...empty(), ...value, composerUploading: 0 }
    }
  } catch { /* Unavailable/corrupt storage must not prevent typing. */ }
  return empty()
}
function save(scope: string, draft: Draft) {
  cache.set(scope, draft)
  try { localStorage.setItem(prefix + scope, JSON.stringify({ ...draft, composerUploading: 0 })) }
  catch { /* Keep the in-memory draft even when storage is full. */ }
}
// Synchronous, small snapshots also cover refresh/closing immediately after typing.
useAgentStore.subscribe((state, previous) => {
  if (!active) return
  const draft = pick(state)
  if ((Object.keys(draft) as Array<keyof Draft>).some(key => state[key] !== previous[key])) save(active, draft)
})
export function activateComposerDraft(scope?: string) {
  if (!scope || active === resolve(scope)) return
  if (active) save(active, pick(useAgentStore.getState()))
  active = resolve(scope)
  useAgentStore.setState(read(active))
}
/** Async uploads/sends must update their originating window, never the currently visible one. */
export function updateComposerDraft(scope: string, update: (draft: Draft) => Draft) {
  const key = resolve(scope)
  const draft = update(active === key ? pick(useAgentStore.getState()) : read(key))
  save(key, draft)
  if (active === key) useAgentStore.setState(draft)
}
/** Lazy local window -> persisted session is an identity promotion, not a task switch. */
export function promoteComposerDraft(from: string, to: string) {
  const draft = active === from ? pick(useAgentStore.getState()) : read(from)
  aliases.set(from, to)
  save(to, draft)
  if (active === from) active = to
  cache.delete(from)
  try { localStorage.removeItem(prefix + from) } catch { /* Optional cleanup. */ }
}
