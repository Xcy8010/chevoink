import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { devNull } from 'node:os'
import { z } from 'zod'

// Deliberately no automatic grant-from-history mode. This process never invokes Agent/AI.
const args = process.argv.slice(2)
const option = (name: string) => args[args.indexOf(name) + 1]
let disconnect: (() => Promise<void>) | undefined
let applied = 0
try {
  // APP_ENV/DATABASE_URL must be explicitly supplied by the operator; don't guess a target.
  if (!process.env.DATABASE_URL || !['production', 'development', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Explicit APP_ENV and DATABASE_URL required')
  // Set before dynamic application imports: config's override:true must not read .env.
  process.env.DOTENV_PATH = devNull
  process.env.DOTENV_CONFIG_QUIET = 'true'
  const { applyReviewedLegacyAttachment, inspectLegacyAttachment, legacyAttachmentReviewSchema, listLegacyAttachmentReferences } = await import('../api/lib/legacy-agent-attachment-grants.js')
  const { prisma } = await import('../api/lib/prisma.js')
  disconnect = () => prisma.$disconnect()
  if (args[0] === 'audit') {
    const rows = await listLegacyAttachmentReferences(args.includes('--after') ? option('--after') : '')
    console.log(JSON.stringify({ status: 'unverified_references_only', references: rows, nextCursor: rows.at(-1)?.messageId ?? null }))
  } else if (args[0] === 'inspect' && args[1]) {
    console.log(JSON.stringify({ url: args[1], ...await inspectLegacyAttachment(args[1]), ownership: 'unverified' }))
  } else if (args[0] === 'apply' && args.includes('--manifest') && args.includes('--sha256') && args.includes('--reviewer')) {
    const bytes = await readFile(option('--manifest'))
    if (bytes.length > 1024 * 1024) throw new Error('Review manifest exceeds 1 MiB')
    if (createHash('sha256').update(bytes).digest('hex') !== option('--sha256')) throw new Error('Review manifest checksum mismatch')
    const manifest = z.array(legacyAttachmentReviewSchema).min(1).max(500).parse(JSON.parse(bytes.toString('utf8')))
    for (const item of manifest) {
      await applyReviewedLegacyAttachment(item, option('--reviewer'))
      applied++
      console.log(JSON.stringify({ status: 'verified_grant', url: item.url }))
    }
  } else throw new Error('Usage: audit [--after id] | inspect <legacy-url> | apply --manifest file --sha256 hash --reviewer operator-id')
} catch (error) {
  // No raw database errors, credentials, file contents or private evidence in console output.
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'REVIEW_FAILED'
  console.error(`[attachment-review] ${code}; ${applied} entries acknowledged. Verify target/manifest; replay the same reviewed manifest to reconcile uncertain commits.`)
  process.exitCode = 1
} finally { await disconnect?.() }
