import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { validateRuntimePolicy } from './lib/runtime-policy.js'

// Read only repository metadata; do not import application config or secrets.
const readJson = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'))
const manifest = readJson('package.json')
const lock = readJson('package-lock.json')
const npmCli = process.env.npm_execpath
// npm run supplies its actual CLI path, avoiding a different npm on PATH/Windows shell.
const npmVersion = npmCli ? execFileSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8' }).trim() : ''
const errors = validateRuntimePolicy({
  nodeVersion: readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim(),
  engines: manifest.engines ?? {},
  packageManager: manifest.packageManager ?? '',
  lockEngines: lock.packages?.['']?.engines ?? {},
}, { node: process.version, npm: npmVersion })
if (errors.length > 0) {
  console.error(`[runtime] Admission failed:\n${errors.join('\n')}\nUse the pinned runtime and npm run runtime:verify.`)
  process.exitCode = 1
} else {
  console.log(`[runtime] Node ${process.version}, npm ${npmVersion}; repository and lockfile agree`)
}
