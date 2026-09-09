import { beforeEach, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../api/lib/agent/tools/types.js'
const mocks = vi.hoisted(() => ({ preview: vi.fn() }))
vi.mock('../../api/lib/data-access.js', () => ({ previewBulkReplaceData: mocks.preview }))
import { bulkReplacePreviewTool, entityRenamePreviewTool } from '../../api/lib/agent/tools/changeset-tools.js'
import { DataAccessError } from '../../api/lib/prisma.js'
const ctx = { userId: 'u', novelId: 'n', runId: 'r' } as ToolContext
beforeEach(() => vi.clearAllMocks())
it.each([bulkReplacePreviewTool, entityRenamePreviewTool])('$name reports verified no-op without inventing an applied change', async tool => {
  for (const code of ['NO_SEARCH_MATCH', 'NO_CHANGE']) {
    mocks.preview.mockRejectedValueOnce(new DataAccessError(404, code, '无需变更'))
    const result = await tool.execute(ctx, tool.parameters.parse({ query: '旧', replacement: '新' }))
    expect(result.summary).toBe('预览完成 · 无需变更')
    expect(result.output).toContain('未创建变更集、未写入正文')
    expect(result.display).toBeUndefined()
    expect(result.snapshot).toBeUndefined()
  }
})
it('does not swallow ownership or persistence failures', async () => {
  const error = new DataAccessError(403, 'FORBIDDEN', '无权限')
  mocks.preview.mockRejectedValueOnce(error)
  await expect(bulkReplacePreviewTool.execute(ctx, bulkReplacePreviewTool.parameters.parse({ query: '旧', replacement: '新' }))).rejects.toBe(error)
})
