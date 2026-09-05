import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { StudioSkeleton } from '@/components/ui/Skeleton'

describe('StudioSkeleton responsive layout', () => {
  const markup = renderToStaticMarkup(createElement(StudioSkeleton))
  const { document } = parseHTML(markup)

  it('replaces both old stacked activity boxes with two compact capsule segments', () => {
    for (const region of ['mobile-activity', 'desktop-activity']) {
      const activity = document.querySelector(`[data-studio-region="${region}"]`)!
      expect(activity.querySelectorAll('[data-studio-activity-capsule]')).toHaveLength(2)
      expect(activity.querySelector('[data-studio-activity-capsules]')?.className).toContain('mobile:gap-0')
      expect(activity.querySelector('[data-studio-activity-capsule="changes"]')?.className).toContain('mobile:border-l')
      expect(activity.className).toContain('justify-center')
      expect(activity.innerHTML).not.toContain('border-t')
    }
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(markup).not.toContain('接受全部')
  })

  it('keeps the wide status card vertical with at most five change rows', () => {
    const dock = document.querySelector('[data-studio-region="desktop-activity-dock"]')!
    expect(dock.className).toContain('hidden')
    expect(dock.querySelector('[data-studio-dock-changes]')?.children).toHaveLength(5)
    expect(dock.querySelector('[data-studio-activity-capsules]')).toBeNull()
  })

  it('aligns composer controls without the old fixed-height spacer', () => {
    for (const region of ['mobile-composer', 'desktop-composer']) {
      const composer = document.querySelector(`[data-studio-region="${region}"]`)!
      expect(composer.className).toContain('rounded-[20px]')
      expect(composer.querySelector('[data-studio-composer-toolbar]')?.className).toContain('mt-1.5')
      expect(composer.querySelector('[data-studio-skeleton-model-effort]')?.className).toContain('ml-auto')
      expect(composer.innerHTML).not.toMatch(/mt-(12|14)/)
    }
    expect(document.querySelector('[data-studio-command-menus]')?.children).toHaveLength(6)
  })

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

  it('provides a desktop Work skeleton with the fused workspace sidebar and centered conversation', () => {
    expect(markup).toContain('data-studio-skeleton="desktop"')
    expect(markup).toContain('data-studio-region="desktop-command-bar"')
    expect(markup).toContain('data-studio-region="desktop-workspace-sidebar"')
    expect(markup).not.toContain('data-studio-region="desktop-task-rail"')
    expect(markup).toContain('data-studio-region="desktop-conversation"')
    expect(markup).toContain('data-studio-region="desktop-activity"')
    expect(markup).toContain('data-studio-region="desktop-composer"')
    expect(markup).toContain('data-studio-region="desktop-inspector-rail"')
    expect(markup).toContain('data-studio-inspector-tab="skills"')
    expect(markup).toContain('data-studio-skeleton-skill-entry="true"')
  })
})
