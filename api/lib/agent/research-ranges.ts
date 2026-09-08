import { z } from 'zod'

export const researchRangesSchema = z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict())

/** Union UTF-16 half-open ranges. Re-reading a window never inflates coverage. */
export function mergeResearchRanges(value: unknown, total: number) {
  const ranges = researchRangesSchema.parse(value).sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const range of ranges) {
    if (range.end <= range.start || range.end > total) throw new Error('Invalid research range')
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}
