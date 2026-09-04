import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STUDIO_APPEARANCE,
  normalizeStudioAppearance,
} from '../../src/features/studio/studio-preferences'

describe('Studio appearance preferences', () => {
  it('hydrates a complete valid preference object', () => {
    expect(normalizeStudioAppearance({
      bodyFont: 'serif',
      contentWidth: 1040,
      fontSize: 18,
      lineHeight: 2,
      reducedMotion: true,
    })).toEqual({
      bodyFont: 'serif',
      contentWidth: 1040,
      fontSize: 18,
      lineHeight: 2,
      reducedMotion: true,
    })
  })

  it('rejects stale or tampered values before they reach CSS variables', () => {
    expect(normalizeStudioAppearance({
      bodyFont: 'comic',
      contentWidth: 999999,
      fontSize: -4,
      lineHeight: 20,
      reducedMotion: 'yes',
    })).toEqual(DEFAULT_STUDIO_APPEARANCE)
  })

  it('merges partial persisted values with safe defaults', () => {
    expect(normalizeStudioAppearance({ fontSize: 15 })).toEqual({
      ...DEFAULT_STUDIO_APPEARANCE,
      fontSize: 15,
    })
  })
})
