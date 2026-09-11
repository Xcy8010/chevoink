import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../api/lib/prisma', () => ({
  DataAccessError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  prisma: { agentSubtask: { findFirst: vi.fn() } },
}))
import { prisma } from '../../api/lib/prisma'
import { requireSelectedSubagent, selectedSubagentGuidance } from '../../api/lib/agent/subagent-selection'
import { startAgentLoopRunSchema } from '../../shared/contracts'

beforeEach(() => vi.resetAllMocks())
describe('explicit subagent selection', () => {
  it('uses user, novel and enabled scope and rejects stale selections', async () => {
    vi.mocked(prisma.agentSubtask.findFirst).mockResolvedValue(null)
    await expect(requireSelectedSubagent('u', 'n', 's')).rejects.toMatchObject({ code: 'SUBAGENT_UNAVAILABLE' })
    expect(prisma.agentSubtask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's', userId: 'u', novelId: 'n', enabled: true } }))
  })
  it('rejects unrestricted/corrupt roles, and accepts an available specialist', async () => {
    vi.mocked(prisma.agentSubtask.findFirst).mockResolvedValue({ id: 's', role: 'orchestrator' } as never)
    await expect(requireSelectedSubagent('u', 'n', 's')).rejects.toMatchObject({ code: 'SUBAGENT_UNAVAILABLE' })
    vi.mocked(prisma.agentSubtask.findFirst).mockResolvedValue({ id: 's', role: 'research' } as never)
    expect(await requireSelectedSubagent('u', 'n', 's')).toMatchObject({ id: 's', role: 'research' })
  })
  it('manual selection is a trigger, not permission bypass or repeated execution', () => {
    const guide = selectedSubagentGuidance('s')
    expect(guide).toContain('subagentId=s')
    expect(guide).toContain('不要求用户重复触发词')
    expect(guide).toContain('调用仍走审批')
    expect(guide).toContain('已完成的委派不要重复执行')
    expect(guide).toContain('不能偷偷改用另一个助手')
  })
  it('request and queue contract retains only one bounded explicit id', () => {
    const input = { sessionId: 's', novelId: 'n', mode: 'build', prompt: '查资料', pinnedSubagentId: ' helper ' }
    expect(startAgentLoopRunSchema.parse(input).pinnedSubagentId).toBe('helper')
    expect(startAgentLoopRunSchema.safeParse({ ...input, pinnedSubagentId: ['a', 'b'] }).success).toBe(false)
    expect(startAgentLoopRunSchema.safeParse({ ...input, pinnedSubagentId: 'a'.repeat(65) }).success).toBe(false)
  })
})
