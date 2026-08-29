import type { Agent2FeatureFlags, Agent2FeatureKey } from '../../shared/contracts/index.js'
import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

const flagLabels: Record<Agent2FeatureKey, string> = {
  volume: '卷结构',
  changeSet: '全书变更集',
  memory2: '故事记忆 2.0',
  skill2: '写作 Skill 2.0',
  storyCompiler: 'Story Compiler 3.0',
  dualWorkspace: '双工作区',
}

/**
 * 空灰度名单代表全量；非空时只对名单用户开放。开关只控制 2.0 增量能力，
 * 数据表和旧读接口始终保留，确保关停后旧客户端仍可读取和导出原稿。
 */
export function resolveAgent2FeatureFlags(userId?: string | null): Agent2FeatureFlags {
  const rollout = env.agent2RolloutUserIds
  const included = rollout.length === 0 || Boolean(userId && rollout.includes(userId))
  return {
    volume: included && env.featureVolumeEnabled,
    changeSet: included && env.featureChangeSetEnabled,
    memory2: included && env.featureMemory2Enabled,
    skill2: included && env.featureSkill2Enabled,
    storyCompiler: included && env.featureStoryCompilerEnabled,
    dualWorkspace: included && env.featureDualWorkspaceEnabled,
    variant: included ? 'v2' : 'v1-compatible',
  }
}

export function isAgent2FeatureEnabled(feature: Agent2FeatureKey, userId?: string | null): boolean {
  return resolveAgent2FeatureFlags(userId)[feature]
}

export function requireAgent2Feature(feature: Agent2FeatureKey, userId?: string | null): void {
  if (!isAgent2FeatureEnabled(feature, userId)) {
    throw new DataAccessError(409, 'FEATURE_DISABLED', `${flagLabels[feature]}当前未对该账号开放。`)
  }
}
