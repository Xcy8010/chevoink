export type StudioBodyFont = 'sans' | 'serif'
export type StudioContentWidth = 720 | 880 | 1040
export type StudioFontSize = 15 | 16 | 18
export type StudioLineHeight = 1.65 | 1.8 | 2

export type StudioAppearancePreferences = {
  bodyFont: StudioBodyFont
  contentWidth: StudioContentWidth
  fontSize: StudioFontSize
  lineHeight: StudioLineHeight
  reducedMotion: boolean
}

export const DEFAULT_STUDIO_APPEARANCE: StudioAppearancePreferences = {
  bodyFont: 'sans',
  contentWidth: 880,
  fontSize: 16,
  lineHeight: 1.8,
  reducedMotion: false,
}

const FONT_SIZES: StudioFontSize[] = [15, 16, 18]
const LINE_HEIGHTS: StudioLineHeight[] = [1.65, 1.8, 2]
const CONTENT_WIDTHS: StudioContentWidth[] = [720, 880, 1040]

/**
 * Persisted settings can outlive several releases. Keep hydration defensive so a
 * stale or manually edited localStorage value never leaks invalid CSS values into
 * the writing surface.
 */
export function normalizeStudioAppearance(value: unknown): StudioAppearancePreferences {
  const candidate = value && typeof value === 'object'
    ? value as Partial<StudioAppearancePreferences>
    : {}

  return {
    bodyFont: candidate.bodyFont === 'serif' ? 'serif' : 'sans',
    contentWidth: CONTENT_WIDTHS.includes(candidate.contentWidth as StudioContentWidth)
      ? candidate.contentWidth as StudioContentWidth
      : DEFAULT_STUDIO_APPEARANCE.contentWidth,
    fontSize: FONT_SIZES.includes(candidate.fontSize as StudioFontSize)
      ? candidate.fontSize as StudioFontSize
      : DEFAULT_STUDIO_APPEARANCE.fontSize,
    lineHeight: LINE_HEIGHTS.includes(candidate.lineHeight as StudioLineHeight)
      ? candidate.lineHeight as StudioLineHeight
      : DEFAULT_STUDIO_APPEARANCE.lineHeight,
    reducedMotion: candidate.reducedMotion === true,
  }
}
