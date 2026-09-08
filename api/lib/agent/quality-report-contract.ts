import { createHash } from 'node:crypto'

/** Revision alone cannot certify a failed critic or an unreviewed replacement. */
export function qualityReportMatchesContent(report: { status: string; chapterRevision: number; deterministicMetrics: unknown }, revision: number, content: string): boolean {
  const metrics = report.deterministicMetrics
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false
  const value = metrics as Record<string, unknown>
  const expected = report.status === 'repaired' ? value.repairedContentHash : value.contentHash
  return report.chapterRevision === revision && ['passed', 'needs_repair', 'repaired'].includes(report.status)
    && value.independentCheck === 'complete' && expected === createHash('sha256').update(content).digest('hex')
}
