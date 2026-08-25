import { describe, expect, it } from 'vitest'

import { resolveAgentChapterVolumeId } from '../../api/lib/agent/tools/chapter-placement.js'

describe('Agent 新章卷归属', () => {
  it('后方存在空卷时仍追加到最后一个已有章节所在卷', () => {
    expect(resolveAgentChapterVolumeId({ lastExistingVolumeId: 'volume-1' })).toBe('volume-1')
  })

  it('显式卷和全书插入点拥有更高优先级', () => {
    expect(resolveAgentChapterVolumeId({ requestedVolumeId: 'volume-4', globalTargetVolumeId: 'volume-2', lastExistingVolumeId: 'volume-1' })).toBe('volume-4')
    expect(resolveAgentChapterVolumeId({ globalTargetVolumeId: 'volume-2', lastExistingVolumeId: 'volume-1' })).toBe('volume-2')
  })
})
