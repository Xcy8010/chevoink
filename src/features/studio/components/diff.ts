export type DiffChunk = {
  kind: 'unchanged' | 'added' | 'removed'
  text: string
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n')
}

function splitLines(value: string) {
  return normalizeLineEndings(value).split('\n')
}

function mergeDiffChunks(chunks: DiffChunk[]) {
  const merged: DiffChunk[] = []

  for (const chunk of chunks) {
    if (!chunk.text) {
      continue
    }

    const lastChunk = merged[merged.length - 1]
    if (lastChunk?.kind === chunk.kind) {
      lastChunk.text = `${lastChunk.text}\n${chunk.text}`
      continue
    }

    merged.push({ ...chunk })
  }

  return merged
}

export function buildDiffChunks(beforeText: string, afterText: string): DiffChunk[] {
  const beforeLines = splitLines(beforeText)
  const afterLines = splitLines(afterText)

  if (beforeLines.length === 1 && beforeLines[0] === '' && afterLines.length === 1 && afterLines[0] === '') {
    return []
  }

  if (beforeText === afterText) {
    return beforeText ? [{ kind: 'unchanged', text: beforeText }] : []
  }

  // Protect the editor from very large quadratic diffs.
  if (beforeLines.length * afterLines.length > 120000) {
    const fallbackChunks: DiffChunk[] = [
      beforeText ? { kind: 'removed' as const, text: beforeText } : null,
      afterText ? { kind: 'added' as const, text: afterText } : null,
    ].filter(Boolean) as DiffChunk[]

    return mergeDiffChunks(fallbackChunks)
  }

  const lcs: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from<number>({ length: afterLines.length + 1 }).fill(0),
  )

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1])
    }
  }

  const chunks: DiffChunk[] = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      chunks.push({
        kind: 'unchanged',
        text: beforeLines[beforeIndex],
      })
      beforeIndex += 1
      afterIndex += 1
      continue
    }

    if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      chunks.push({
        kind: 'removed',
        text: beforeLines[beforeIndex],
      })
      beforeIndex += 1
      continue
    }

    chunks.push({
      kind: 'added',
      text: afterLines[afterIndex],
    })
    afterIndex += 1
  }

  while (beforeIndex < beforeLines.length) {
    chunks.push({
      kind: 'removed',
      text: beforeLines[beforeIndex],
    })
    beforeIndex += 1
  }

  while (afterIndex < afterLines.length) {
    chunks.push({
      kind: 'added',
      text: afterLines[afterIndex],
    })
    afterIndex += 1
  }

  return mergeDiffChunks(chunks)
}

// —— 以下为 IDE 式分块审查所需的 hunk 级 diff ——
// 与 buildDiffChunks 不同：逐行保留（含空行）、不做丢行合并，保证能精确重建 before/after 原文

type DiffOp = {
  kind: 'unchanged' | 'added' | 'removed'
  line: string
}

export type ReviewDiffSegment = {
  kind: 'unchanged' | 'added' | 'removed'
  text: string
  /** 所属变更块序号（0 基）；未变更片段为 null */
  hunkIndex: number | null
}

function buildDiffOps(beforeText: string, afterText: string): DiffOp[] {
  const beforeLines = splitLines(beforeText)
  const afterLines = splitLines(afterText)

  if (normalizeLineEndings(beforeText) === normalizeLineEndings(afterText)) {
    return beforeLines.map((line) => ({ kind: 'unchanged' as const, line }))
  }

  // 超大文本退化为整段替换，避免 O(n²) LCS 卡顿
  if (beforeLines.length * afterLines.length > 120000) {
    return [
      ...beforeLines.map((line) => ({ kind: 'removed' as const, line })),
      ...afterLines.map((line) => ({ kind: 'added' as const, line })),
    ]
  }

  const lcs: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from<number>({ length: afterLines.length + 1 }).fill(0),
  )

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1])
    }
  }

  const ops: DiffOp[] = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      ops.push({ kind: 'unchanged', line: beforeLines[beforeIndex] })
      beforeIndex += 1
      afterIndex += 1
      continue
    }

    if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      ops.push({ kind: 'removed', line: beforeLines[beforeIndex] })
      beforeIndex += 1
      continue
    }

    ops.push({ kind: 'added', line: afterLines[afterIndex] })
    afterIndex += 1
  }

  while (beforeIndex < beforeLines.length) {
    ops.push({ kind: 'removed', line: beforeLines[beforeIndex] })
    beforeIndex += 1
  }

  while (afterIndex < afterLines.length) {
    ops.push({ kind: 'added', line: afterLines[afterIndex] })
    afterIndex += 1
  }

  return ops
}

/** 构建审查视图片段：连续的变更行归入同一个 hunk（变更块），供逐块导航与定夺 */
export function buildReviewDiff(beforeText: string, afterText: string): {
  segments: ReviewDiffSegment[]
  hunkCount: number
} {
  const ops = buildDiffOps(beforeText, afterText)
  const segments: ReviewDiffSegment[] = []
  let hunkCount = 0
  let inHunk = false

  for (const op of ops) {
    const isChange = op.kind !== 'unchanged'
    if (isChange && !inHunk) {
      inHunk = true
      hunkCount += 1
    }
    if (!isChange) {
      inHunk = false
    }

    const hunkIndex = isChange ? hunkCount - 1 : null
    const lastSegment = segments[segments.length - 1]
    if (lastSegment && lastSegment.kind === op.kind && lastSegment.hunkIndex === hunkIndex) {
      lastSegment.text = `${lastSegment.text}\n${op.line}`
      continue
    }

    segments.push({ kind: op.kind, text: op.line, hunkIndex })
  }

  return { segments, hunkCount }
}

/**
 * 按用户对第 hunkIndex 个变更块的定夺重建基线与结果：
 * - accept（采纳）：把该块的新内容写进基线 before，结果 after 不变
 * - reject（撤回）：把该块从结果 after 中还原为旧内容，基线 before 不变
 */
export function resolveReviewHunk(
  beforeText: string,
  afterText: string,
  hunkIndex: number,
  decision: 'accept' | 'reject',
): { before: string; after: string } {
  const ops = buildDiffOps(beforeText, afterText)
  const beforeLines: string[] = []
  const afterLines: string[] = []
  let currentHunk = -1
  let inHunk = false

  for (const op of ops) {
    const isChange = op.kind !== 'unchanged'
    if (isChange && !inHunk) {
      inHunk = true
      currentHunk += 1
    }
    if (!isChange) {
      inHunk = false
    }
    const inTarget = isChange && currentHunk === hunkIndex

    if (op.kind === 'unchanged') {
      beforeLines.push(op.line)
      afterLines.push(op.line)
      continue
    }

    if (op.kind === 'removed') {
      // 基线独有的行：采纳目标块=从基线剔除；撤回目标块=同时还原到结果里
      if (!inTarget) {
        beforeLines.push(op.line)
        continue
      }
      if (decision === 'accept') {
        continue
      }
      beforeLines.push(op.line)
      afterLines.push(op.line)
      continue
    }

    // added：结果独有的行：采纳目标块=写进基线；撤回目标块=从结果剔除
    if (!inTarget) {
      afterLines.push(op.line)
      continue
    }
    if (decision === 'reject') {
      continue
    }
    beforeLines.push(op.line)
    afterLines.push(op.line)
  }

  return { before: beforeLines.join('\n'), after: afterLines.join('\n') }
}
