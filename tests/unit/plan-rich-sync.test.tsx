// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ replace: vi.fn(), update: null as null | ((ctx:unknown,next:string,prev:string)=>void), blur:null as null | (()=>void) }))
vi.mock('@milkdown/kit/core', () => ({editorViewCtx:'view',parserCtx:'parser'}))
vi.mock('@milkdown/kit/utils', () => ({replaceAll:(text:string) => () => state.replace(text)}))
vi.mock('@milkdown/crepe/feature/placeholder', () => ({placeholder:{}}))
vi.mock('@milkdown/crepe/builder', () => ({ CrepeBuilder: class {
  editor = { action:(fn:(ctx:unknown)=>unknown) => fn({get:(key:string) => key==='parser' ? (text:string)=>text.trim() : {state:{doc:{eq:(text:string)=>text==='same'}}}}) }
  addFeature(){return this} setReadonly(){} destroy(){return Promise.resolve()}
  on(fn:(listener:unknown)=>void){fn({markdownUpdated:(fn:typeof state.update)=>{state.update=fn},blur:(fn:typeof state.blur)=>{state.blur=fn}})}
  create(){return Promise.resolve()}
} }))
import PlanRichMarkdownEditor from '../../src/features/studio/components/PlanRichMarkdownEditor'
import { readPlanPosition, savePlanPosition } from '../../src/features/studio/components/plan-view-position'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('restores per-task scroll after async editor creation without resetting it on subsequent input', async () => {
  sessionStorage.clear()
  const seed = document.createElement('div'); seed.scrollTop = 620
  savePlanPosition('user:a:task:plan:preview', seed)
  const view = render(<PlanRichMarkdownEditor positionKey="user:a:task:plan:preview" markdown="same" editable mobile={false} />)
  await act(async () => {})
  const node = view.container.firstElementChild as HTMLElement
  expect(node.scrollTop).toBe(620)
  node.scrollTop = 840; fireEvent.scroll(node)
  view.rerender(<PlanRichMarkdownEditor positionKey="user:a:task:plan:preview" markdown={'same\n'} editable mobile={false} />)
  expect(node.scrollTop).toBe(840)
  expect(readPlanPosition('user:a:task:plan:preview')).toBe(840)
  expect(readPlanPosition('user:b:task:plan:preview')).toBe(0)
})
it('does not replace an equivalent normalized document but still applies a real external update', async()=>{
  const view=render(<PlanRichMarkdownEditor markdown="same" editable mobile={false}/> )
  await act(async()=>{})
  view.rerender(<PlanRichMarkdownEditor markdown={'same\n'} editable mobile={false}/> )
  expect(state.replace).not.toHaveBeenCalled()
  view.rerender(<PlanRichMarkdownEditor markdown="changed" editable mobile={false}/> )
  expect(state.replace).toHaveBeenCalledExactlyOnceWith('changed')
})
it('ignores late update and blur notifications from a disposed document', async()=>{
  const onChange=vi.fn(),onBlur=vi.fn()
  const view=render(<PlanRichMarkdownEditor markdown="same" editable mobile={false} onChange={onChange} onBlur={onBlur}/> )
  await act(async()=>{})
  const oldUpdate=state.update!,oldBlur=state.blur!
  view.unmount()
  oldUpdate(null,'late edit','same');oldBlur()
  expect(onChange).not.toHaveBeenCalled();expect(onBlur).not.toHaveBeenCalled()
})
