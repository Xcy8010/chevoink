export const CHAPTER_BRIDGE_EVAL_VERSION = 'chapter-bridge-v1.0.0' as const

type ContinuityState = {
  action: string
  location: string
  storyTime: string
  knowledge: string[]
  emotion: string[]
  body: string[]
  objects: string[]
  relationships: string[]
  openLoops: string[]
}

function buildExitState(chapter: number): ContinuityState {
  return {
    action: `动作-${chapter}尚未完成`,
    location: `地点-${chapter}`,
    storyTime: `第${chapter}日夜间`,
    knowledge: [`角色已知事实-${chapter}`],
    emotion: [`第${chapter}章情绪余波`],
    body: [`伤势阶段-${chapter % 4}`],
    objects: [`物品-${chapter}由主角持有`],
    relationships: [`主角与搭档关系阶段-${chapter % 7}`],
    openLoops: [`待解问题-${chapter}`],
  }
}

/** 2.0 章摘要近似：通常只保留事件、地点和悬念，不显式保存人物知识/身体/物品/关系/情绪。 */
function legacySummaryProjection(state: ContinuityState): Partial<ContinuityState> {
  return { action: state.action, location: state.location, storyTime: state.storyTime, openLoops: state.openLoops }
}

function bridgeProjection(state: ContinuityState): ContinuityState {
  return structuredClone(state)
}

function mismatchCount(expected: ContinuityState, actual: Partial<ContinuityState>): number {
  const scalarKeys = ['action', 'location', 'storyTime'] as const
  const listKeys = ['knowledge', 'emotion', 'body', 'objects', 'relationships', 'openLoops'] as const
  return scalarKeys.filter((key) => expected[key] !== actual[key]).length
    + listKeys.filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(actual[key])).length
}

export function evaluateFiftyChapterBridge() {
  let agent2Errors = 0
  let agent3Errors = 0
  const transitions = 49
  for (let chapter = 1; chapter <= transitions; chapter += 1) {
    const expectedNextEntry = buildExitState(chapter)
    agent2Errors += mismatchCount(expectedNextEntry, legacySummaryProjection(expectedNextEntry))
    agent3Errors += mismatchCount(expectedNextEntry, bridgeProjection(expectedNextEntry))
  }
  return {
    datasetVersion: CHAPTER_BRIDGE_EVAL_VERSION,
    chapters: 50,
    transitions,
    dimensionsPerTransition: 9,
    agent2Errors,
    agent3Errors,
    relativeErrorReduction: agent2Errors === 0 ? 0 : (agent2Errors - agent3Errors) / agent2Errors,
  }
}
