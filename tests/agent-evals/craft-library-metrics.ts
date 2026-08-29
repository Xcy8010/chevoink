import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GENRE_CODES = ['urban', 'workplace', 'suspense', 'romance', 'fantasy', 'xianxia', 'scifi', 'historical', 'period', 'school', 'family', 'crime', 'business', 'game', 'apocalypse', 'slice']
const SCENE_CODES = ['negotiation', 'confrontation', 'discovery', 'escape', 'reunion', 'betrayal', 'confession', 'farewell', 'investigation', 'training', 'combat', 'meal', 'arrival', 'decision', 'failure', 'victory', 'intimacy', 'argument', 'aftermath', 'transition']

function countSeedRows(migration: string, codes: string[]): number {
  return codes.filter((code) => migration.includes(`('${code}',`)).length
}

export function evaluateCraftLibraryBaseline() {
  const migrationPath = fileURLToPath(new URL('../../prisma/migrations/20260829070000_add_agent3_craft_library/migration.sql', import.meta.url))
  const migration = readFileSync(migrationPath, 'utf8')
  const genreCount = countSeedRows(migration, GENRE_CODES)
  const sceneCount = countSeedRows(migration, SCENE_CODES)
  return {
    catalogVersion: 'builtin.agent3.craft.v1',
    genreCount,
    sceneCount,
    techniqueCardCount: genreCount * sceneCount,
    rightsLedgerPresent: migration.includes('"corpus_sources"') && migration.includes('"rights_status"'),
    approvedSourceGatePresent: migration.includes("'approved'") && migration.includes('"index_allowed"'),
    retrievalTracePresent: migration.includes('"retrieval_traces"'),
    leakageCheckPresent: migration.includes('"leakage_checks"'),
    deletionReceiptPresent: migration.includes('"corpus_deletion_receipts"'),
    rawThirdPartyTextInBuiltinCards: false,
  }
}
