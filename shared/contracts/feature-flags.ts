export type Agent2FeatureKey = 'volume' | 'changeSet' | 'memory2' | 'skill2' | 'storyCompiler' | 'dualWorkspace'

export type Agent2FeatureFlags = Record<Agent2FeatureKey, boolean> & {
  /** v1-compatible 表示该用户未进入 2.0 灰度；旧客户端可安全忽略本字段。 */
  variant: 'v1-compatible' | 'v2'
}

export const DEFAULT_AGENT2_FEATURE_FLAGS: Agent2FeatureFlags = {
  volume: true,
  changeSet: true,
  memory2: true,
  skill2: true,
  storyCompiler: true,
  dualWorkspace: true,
  variant: 'v2',
}
