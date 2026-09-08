import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { itemizedRatesSchema } from '../api/lib/billing/token-price.js'
import { evaluatePricingReplay } from '../api/lib/billing/pricing-replay.js'

// Read-only offline input: use confirmed, de-identified receipts and an already
// frozen candidate. This command neither connects to production nor fits rates.
const inputPath = process.argv[2]
if (!inputPath) throw new Error('Usage: npx tsx scripts/audit-credit-pricing.ts <replay.json>')
const raw = readFileSync(inputPath, 'utf8')
const token = z.number().int().nonnegative().nullable()
const input = z.object({
  candidateId: z.string().min(1).max(64),
  sampleSet: z.enum(['training', 'holdout', 'shadow']),
  rates: z.record(z.string(), itemizedRatesSchema),
  samples: z.array(z.object({ userKey: z.string().min(1), taskKey: z.string().min(1), modelTier: z.string().min(1),
    promptTokens: token, completionTokens: token, cacheHitTokens: token, multiplierBps: z.number().int().nonnegative() }).strict()).max(1_000_000),
}).strict().parse(JSON.parse(raw))
const report = { candidateId: input.candidateId, sampleSet: input.sampleSet,
  inputHash: createHash('sha256').update(raw).digest('hex'),
  ...evaluatePricingReplay(input.samples, input.rates) }
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
if (!report.feeDistributionWithinLimits) process.exitCode = 1
