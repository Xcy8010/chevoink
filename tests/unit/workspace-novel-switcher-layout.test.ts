import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import WorkspaceNovelSwitcher from '../../src/features/studio/components/WorkspaceNovelSwitcher'

describe('Workspace novel switcher desktop layout', () => {
  it('shrinks the compact trigger root to its real content width', () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceNovelSwitcher, {
      currentNovelId: 'novel-1',
      currentNovelTitle: '锈海之门',
      novels: [],
      compactTrigger: true,
      onSelectNovel: vi.fn(),
      onCreateNovel: vi.fn(),
    }))

    expect(markup).toContain('inline-flex')
    expect(markup).toContain('w-auto')
    expect(markup).toContain('shrink-0')
  })
})
