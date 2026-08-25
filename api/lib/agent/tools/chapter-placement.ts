/** Agent 新章的卷选择优先级：显式目标 > 全书插入点所在卷 > 最后一个已有章节所在卷。 */
export function resolveAgentChapterVolumeId(input: {
  requestedVolumeId?: string
  globalTargetVolumeId?: string | null
  lastExistingVolumeId?: string | null
}): string | undefined {
  return input.requestedVolumeId ?? input.globalTargetVolumeId ?? input.lastExistingVolumeId ?? undefined
}
