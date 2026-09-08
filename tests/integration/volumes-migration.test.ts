import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../api/lib/prisma.js'
import { handleTestDatabaseUnavailable } from '../support/database-availability.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(handleTestDatabaseUnavailable)
afterAll(async () => { await prisma.$disconnect() })

describe.skipIf(!dbAvailable)('historical volume migration with populated legacy tables', () => {
  it('backfills every old novel, preserves chapter text/order, and installs constraints', async () => {
    // Dedicated, transaction-local schema. Never alter public tables or rollback a real migration.
    const schema = `chevoink_test_volume_${randomUUID().replaceAll('-', '')}`
    const rollbackFixture = new Error('rollback isolated migration fixture')
    const migration = readFileSync(new URL('../../prisma/migrations/20260825200000_add_volumes/migration.sql', import.meta.url), 'utf8')
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`)
        // Minimal pre-migration schema containing all columns touched by this historical SQL.
        await tx.$executeRawUnsafe('CREATE TABLE novels (id VARCHAR(64) PRIMARY KEY)')
        await tx.$executeRawUnsafe('CREATE TABLE chapters (id VARCHAR(64) PRIMARY KEY, novel_id VARCHAR(64) NOT NULL REFERENCES novels(id), order_index INTEGER NOT NULL, content TEXT NOT NULL)')
        await tx.$executeRaw`INSERT INTO novels (id) VALUES ('old-empty'), ('old-written')`
        await tx.$executeRaw`INSERT INTO chapters (id, novel_id, order_index, content) VALUES ('chapter-2', 'old-written', 2, '第二章正文'), ('chapter-1', 'old-written', 1, '第一章正文')`
        // This fixed migration has only plain semicolon-delimited DDL/DML; not a general SQL parser.
        for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
          await tx.$executeRawUnsafe(statement)
        }
        const volumes = await tx.$queryRaw<Array<{ novel_id: string; title: string; order_index: number }>>`
          SELECT novel_id, title, order_index FROM volumes ORDER BY novel_id
        `
        expect(volumes).toEqual([
          { novel_id: 'old-empty', title: '第一卷', order_index: 1 },
          { novel_id: 'old-written', title: '第一卷', order_index: 1 },
        ])
        const chapters = await tx.$queryRaw<Array<{ content: string; order_index: number; order_in_volume: number; novel_id: string }>>`
          SELECT c.content, c.order_index, c.order_in_volume, v.novel_id
          FROM chapters c JOIN volumes v ON v.id = c.volume_id ORDER BY c.order_index
        `
        expect(chapters).toEqual([
          { content: '第一章正文', order_index: 1, order_in_volume: 1, novel_id: 'old-written' },
          { content: '第二章正文', order_index: 2, order_in_volume: 2, novel_id: 'old-written' },
        ])
        const columns = await tx.$queryRaw<Array<{ is_nullable: string }>>`
          SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = ${schema} AND table_name = 'chapters'
            AND column_name IN ('volume_id', 'order_in_volume')
        `
        expect(columns).toEqual([{ is_nullable: 'NO' }, { is_nullable: 'NO' }])
        const constraints = await tx.$queryRaw<Array<{ conname: string }>>`
          SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = ${schema} AND c.conname IN ('chapters_volume_id_fkey', 'volumes_novel_id_fkey') ORDER BY c.conname
        `
        expect(constraints.map((row) => row.conname)).toEqual(['chapters_volume_id_fkey', 'volumes_novel_id_fkey'])
        throw rollbackFixture
      }, { timeout: 15_000 })
    } catch (error) {
      if (error !== rollbackFixture) throw error
    }
    const remaining = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) FROM pg_namespace WHERE nspname = ${schema}`
    expect(Number(remaining[0].count)).toBe(0)
  })
})
