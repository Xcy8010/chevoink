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
