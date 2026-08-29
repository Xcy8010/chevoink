import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StudioSkeleton } from '@/components/ui/Skeleton'

describe('StudioSkeleton responsive layout', () => {
  const markup = renderToStaticMarkup(createElement(StudioSkeleton))

  it('provides a mobile skeleton matching the integrated agent workspace', () => {
    expect(markup).toContain('data-studio-skeleton="mobile"')
    expect(markup).toContain('data-studio-region="mobile-header"')
    expect(markup).toContain('data-studio-region="mobile-conversation"')
    expect(markup).toContain('data-studio-region="mobile-activity"')
    expect(markup).toContain('data-studio-region="mobile-composer"')
    expect(markup).toContain('data-studio-region="mobile-bottom-nav"')
    expect(markup.match(/data-studio-nav-item="true"/g)).toHaveLength(5)
    expect(markup).toContain('data-studio-nav-key="more"')
    expect(markup).toContain('pb-[max(var(--safe-bottom),4px)]')
  })

  it('provides a desktop Work skeleton with compact rails and a centered conversation', () => {
    expect(markup).toContain('data-studio-skeleton="desktop"')
    expect(markup).toContain('data-studio-region="desktop-command-bar"')
    expect(markup).toContain('data-studio-region="desktop-task-rail"')
    expect(markup).toContain('data-studio-region="desktop-conversation"')
    expect(markup).toContain('data-studio-region="desktop-activity"')
    expect(markup).toContain('data-studio-region="desktop-composer"')
    expect(markup).toContain('data-studio-region="desktop-inspector-rail"')
    expect(markup).toContain('data-studio-inspector-tab="skills"')
    expect(markup).toContain('data-studio-skeleton-skill-entry="true"')
  })
})
