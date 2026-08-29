import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { CN_FICTION_EVAL_SCENARIOS, CN_FICTION_EVAL_VERSION } from '../tests/agent-evals/cn-fiction-scenarios.js'
import { evaluateSkillRouting } from '../tests/agent-evals/cn-fiction-metrics.js'
import { evaluateFiftyChapterBridge } from '../tests/agent-evals/chapter-bridge-metrics.js'

function readGitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const datasetHash = createHash('sha256').update(JSON.stringify(CN_FICTION_EVAL_SCENARIOS)).digest('hex')
const report = {
  schemaVersion: 'agent3-eval-report.v1',
  datasetVersion: CN_FICTION_EVAL_VERSION,
  datasetHash,
  codeSha: readGitSha(),
  model: process.env.AGENT3_EVAL_MODEL ?? 'deterministic-skill-router',
  temperature: Number(process.env.AGENT3_EVAL_TEMPERATURE ?? 0),
  skillCatalogVersion: '3.0.0',
  generatedAt: new Date().toISOString(),
  routing: evaluateSkillRouting(CN_FICTION_EVAL_SCENARIOS),
  chapterBridge: evaluateFiftyChapterBridge(),
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
