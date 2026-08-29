import { analyzeDeterministicQuality } from '../../api/lib/agent/humanity-quality.js'

const HARD_NEGATIVES = [
  '量子干涉仪的读数停在零点。研究员核对了第二遍，没有抬头。',
  '窗外青山如浅釉，雨只落了一阵。下一秒，债主的电话打了进来。',
  '“坏了呗。”老周踢开工具箱。“修。别杵着。”',
  '她把碗洗净，关掉厨房的灯。今晚没有答案，也不需要一个悬念句。',
]

const POSITIVES = [
  '他把门锁上，不让任何人进来。他把门锁上，不让任何人进来。',
  '他看见门开了。\n他看见灯灭了。\n他看见电梯停了。',
  '风像一把生锈的锯子。风像一把生锈的锯子。',
  '她解释自己没有撒谎，她确实没有撒谎，她说的都是真的。她解释自己没有撒谎，她确实没有撒谎，她说的都是真的。',
]

export function evaluateDeterministicHumanityGate() {
  const falsePositives = HARD_NEGATIVES.filter((sample) => analyzeDeterministicQuality(sample).findings.length > 0)
  const detected = POSITIVES.filter((sample) => analyzeDeterministicQuality(sample).findings.length > 0)
  return {
    hardNegativeCount: HARD_NEGATIVES.length,
    positiveCount: POSITIVES.length,
    hardNegativeFalsePositiveRate: falsePositives.length / HARD_NEGATIVES.length,
    mechanicalPatternDetectionRate: detected.length / POSITIVES.length,
    falsePositiveSamples: falsePositives,
  }
}
