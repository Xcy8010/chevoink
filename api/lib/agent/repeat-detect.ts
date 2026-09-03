/**
 * plan/18 P1 正文/思考信道重复检测器。
 *
 * 机制：把流式增量切成不重叠的 50 字块（gram），在最近 2000 字滑动窗口（=40 个 gram）内计数，
 * 同一 gram 出现 ≥3 次即判重复——复读机在窗口内必然反复产出同一段文本，此特征确定性成立。
 * 用不重叠块近似滑窗 n-gram：O(n) 复杂度、零流式延迟，观察阶段够用。
 *
 * 误报防线：
 * - 空白占比过高的 gram（换行列表、分隔线）不参与计数；
 * - 同一 gram 只报一次命中（防刷屏），不同 gram 命中会继续上报——干预模式的「第二次命中终止」
 *   因此不会被同一 gram 的去重挡住；
 * - 窗口滑出时旧 gram 计数递减，长任务中远期重复不误伤近期正常输出。
 */
export interface RepeatDetector {
  /** 喂入流式增量；返回本次新命中的重复 gram（无命中返回 null） */
  push(text: string): string | null
}

export function createRepeatDetector(windowChars = 2000, gramChars = 50, hitThreshold = 3): RepeatDetector {
  const maxGrams = Math.max(2, Math.floor(windowChars / gramChars))
  const grams: string[] = []
  const counts = new Map<string, number>()
  const reported = new Set<string>()
  let pending = ''

  return {
    push(text: string): string | null {
      pending += text
      let hit: string | null = null
      while (pending.length >= gramChars) {
        const gram = pending.slice(0, gramChars)
        pending = pending.slice(gramChars)
        // 空白太多的块（换行/分隔符堆）不是复读证据
        if (gram.trim().length < gramChars * 0.6) continue
        grams.push(gram)
        const count = (counts.get(gram) ?? 0) + 1
        counts.set(gram, count)
        if (count >= hitThreshold && !reported.has(gram)) {
          reported.add(gram)
          hit = gram
        }
        while (grams.length > maxGrams) {
          const stale = grams.shift()
          if (!stale) break
          const left = (counts.get(stale) ?? 1) - 1
          if (left <= 0) counts.delete(stale)
          else counts.set(stale, left)
        }
      }
      return hit
    },
  }
}
