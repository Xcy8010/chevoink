import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inspectSource } from './lib/source-inventory.js'

const root = process.cwd()
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean))
const candidates = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))].sort()
const sources = candidates.filter((path) => /^(src|api|shared)\/.+\.(?:tsx?|jsx?|mjs|cjs)$/.test(path))
const resources = candidates.filter((path) => /^(public|prisma|android)\//.test(path) && !/\.(?:keystore|jks)$/.test(path))
const hash = (content: Buffer) => createHash('sha256').update(content).digest('hex')
const files = sources.filter((path) => existsSync(resolve(root, path))).map((path) => {
  const content = readFileSync(resolve(root, path))
  return { path, tracked: tracked.has(path), sha256: hash(content), ...inspectSource(path, content.toString('utf8')) }
})
const assetManifest = resources.filter((path) => existsSync(resolve(root, path))).map((path) => {
  const content = readFileSync(resolve(root, path))
  return { path, bytes: content.length, sha256: hash(content) }
})

type Metric = { total: number; covered: number; skipped: number; pct: number }
type Metrics = Record<'lines' | 'statements' | 'functions' | 'branches', Metric>
const metrics = ['lines', 'statements', 'functions', 'branches'] as const
const emptyMetrics = (): Metrics => Object.fromEntries(metrics.map((key) => [key, { total: 0, covered: 0, skipped: 0, pct: 100 }])) as Metrics
const summaryPath = resolve(root, 'coverage/coverage-summary.json')
let coverage: unknown = null
if (existsSync(summaryPath)) {
  const input = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, Metrics>
  const business = emptyMetrics()
  const trackedScope = emptyMetrics()
  const outsideBusiness: Array<{ path: string; tracked: boolean; lines: number }> = []
  for (const [path, data] of Object.entries(input)) {
    if (path === 'total') continue
    const relative = path.replaceAll('\\', '/').slice(root.replaceAll('\\', '/').length + 1)
    const isBusiness = sources.includes(relative)
    for (const [include, output] of [[isBusiness, business], [tracked.has(relative), trackedScope]] as const) {
      if (!include) continue
      for (const key of metrics) {
        output[key].total += data[key].total
        output[key].covered += data[key].covered
        output[key].skipped += data[key].skipped
      }
    }
    if (!isBusiness) outsideBusiness.push({ path: relative, tracked: tracked.has(relative), lines: data.lines.total })
  }
  for (const output of [business, trackedScope]) {
    for (const key of metrics) output[key].pct = output[key].total ? output[key].covered / output[key].total * 100 : 100
  }
  coverage = {
    reportSha256: hash(readFileSync(summaryPath)), raw: input.total, trackedScope, business, outsideBusiness,
    note: 'Three views of the SAME run; scope differences are not test improvements. Does not alter CI thresholds.',
  }
}
const result = {
  version: 1, capturedAt: new Date().toISOString(), head: git('rev-parse', 'HEAD').trim(),
  modifiedTrackedPaths: git('diff', '--name-only', '-z', 'HEAD').split('\0').filter(Boolean),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  limitations: [
    'Static literal routes, imports, tool definitions and storage call sites; dynamic expressions require manual review.',
    'Hashes freeze sources/assets, not production data or credentials; no production DB/API access.',
    'No claims of role coverage, visual equivalence, UI reachability or completed acceptance.',
  ],
  files, assetManifest, coverage,
}
const directory = resolve(root, 'output/engineering-baseline')
mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, 'source-inventory.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ head: result.head, sources: files.length, assets: assetManifest.length, references: files.reduce((n, file) => n + file.references.length, 0), output: 'output/engineering-baseline/source-inventory.json' }))
