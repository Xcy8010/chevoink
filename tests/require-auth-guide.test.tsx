// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RequireAuthRoute from '../src/app/routes/RequireAuthRoute'

const auth = vi.hoisted(() => ({ authStatus: 'guest', sessionUser: null as null | { id: string } }))
vi.mock('@/store/useShellStore', () => ({ useShellStore: (selector: (state: typeof auth) => unknown) => selector(auth) }))
afterEach(() => { cleanup(); auth.authStatus = 'guest'; auth.sessionUser = null })

describe('centered unauthenticated guidance', () => {
  it('shows branding and login links with the full return destination', () => {
    render(<MemoryRouter initialEntries={['/messages?conversationId=example']}><RequireAuthRoute centered><div>private messages</div></RequireAuthRoute></MemoryRouter>)
    expect(screen.getByAltText('Chevoink').getAttribute('src')).toBe('/favicon.png')
    expect(screen.getByRole('link', { name: '去登录' }).getAttribute('href')).toBe('/login?redirect=%2Fmessages%3FconversationId%3Dexample')
    expect(screen.getByRole('link', { name: '创建账户' }).getAttribute('href')).toBe('/register?redirect=%2Fmessages%3FconversationId%3Dexample')
    expect(screen.queryByText('private messages')).toBeNull()
    expect(screen.getByAltText('Chevoink').closest('section')?.classList.contains('flex-1')).toBe(true)
    expect(screen.getByAltText('Chevoink').closest('section')?.parentElement?.classList.contains('overflow-y-auto')).toBe(true)
  })

  it.each(['guest', 'checking', 'unavailable'])('does not mount private queries when %s', (status) => {
    auth.authStatus = status
    const Child = vi.fn(() => <div>private messages</div>)
    render(<MemoryRouter><RequireAuthRoute centered><Child /></RequireAuthRoute></MemoryRouter>)
    expect(Child).not.toHaveBeenCalled()
    if (status !== 'guest') expect(screen.queryByRole('link', { name: '去登录' })).toBeNull()
  })

  it('renders authenticated content without the guest wrapper', () => {
    auth.authStatus = 'authenticated'; auth.sessionUser = { id: 'test' }
    render(<MemoryRouter><RequireAuthRoute centered><div>private messages</div></RequireAuthRoute></MemoryRouter>)
    expect(screen.getByText('private messages')).toBeTruthy()
    expect(screen.queryByAltText('Chevoink')).toBeNull()
  })
})
