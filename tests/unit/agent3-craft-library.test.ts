import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { extractStyleStats, isWhitelistedPublicLicense, longestCommonSubstringLength } from '../../api/lib/agent/craft-library.js'
import { AGENT_TOOL_GOVERNANCE } from '../../api/lib/agent/tools/governance.js'
import { allTools } from '../../api/lib/agent/tools/registry.js'
import { corpusSourceCreateSchema, craftSearchQuerySchema, styleSampleRequestSchema } from '../../shared/contracts/index.js'

describe('Agent 3.0 合法文笔库与 Style DNA', () => {
  it('作者画像只生成统计特征，不回传或嵌入样章原文', () => {
    const sample = '“你先别动。”林舟把钥匙压在桌面上。\n顾棠没回答，只看了一眼门口。'.repeat(20)
    const stats = extractStyleStats([sample])
    expect(stats.sampleCount).toBe(1)
    expect(stats.sampleChars).toBeGreaterThan(500)
    expect(stats.dialogueRatio).toBeGreaterThan(0)
    expect(stats.medianSentenceChars).toBeGreaterThan(0)
    expect(JSON.stringify(stats)).not.toContain('林舟')
    expect(JSON.stringify(stats)).not.toContain('钥匙')
  })

  it('最长公共子串检测保留连续复写证据而不保存原文', () => {
    const copied = '门外的雨声忽然停了，走廊尽头传来金属轻响。'
    expect(longestCommonSubstringLength(`开头。${copied}结尾。`, `另一段。${copied}后续。`)).toBeGreaterThanOrEqual(copied.length)
    expect(longestCommonSubstringLength('完全不同的行动与结果。', '没有共同长句的另一段文字。')).toBeLessThan(6)
  })

  it('权利合同要求商业、存储、索引权限分别声明，私有样章必须显式同意', () => {
    expect(corpusSourceCreateSchema.safeParse({
      name: '来源', sourceClass: 'licensed', rightsHolder: '权利方', license: 'Commercial',
      commercialUse: true, redistribution: false, modification: true, rawStorageAllowed: true,
      indexAllowed: true, evidence: '合同编号与权利范围已经复核。',
    }).success).toBe(true)
    expect(corpusSourceCreateSchema.safeParse({ name: '来源', sourceClass: 'licensed' }).success).toBe(false)
    expect(styleSampleRequestSchema.safeParse({ title: '我的样章', chapterIds: ['c1'], consent: false }).success).toBe(false)
    expect(craftSearchQuerySchema.parse({ genre: '都市', sceneType: '谈判' }).limit).toBe(4)
    expect(isWhitelistedPublicLicense('public_domain', 'CC0-1.0')).toBe(true)
    expect(isWhitelistedPublicLicense('permissive', 'CC-BY-4.0')).toBe(true)
    expect(isWhitelistedPublicLicense('public_domain', '来源方自行声称公版')).toBe(false)
    expect(isWhitelistedPublicLicense('licensed', 'Custom-Commercial')).toBe(true)
  })

  it('五个运行时工具全部注册并受治理，技法检索明确禁止作者克隆与局部误触发', () => {
    const names = ['craft_search', 'style_profile_extract', 'style_profile_get', 'retrieval_trace_read', 'style_leakage_check']
    for (const name of names) {
      expect(allTools.some((tool) => tool.name === name)).toBe(true)
      expect(AGENT_TOOL_GOVERNANCE[name as keyof typeof AGENT_TOOL_GOVERNANCE]).toBeDefined()
    }
    const search = allTools.find((tool) => tool.name === 'craft_search')
    expect(search?.description).toContain('绝不返回小说原文')
    expect(search?.description).toContain('不支持克隆在世作者')
    expect(search?.description).toContain('只改错字、标题、元数据或一个局部短句时禁止调用')
    expect(allTools.find((tool) => tool.name === 'style_profile_extract')?.alwaysConfirm).toBe(true)
  })

  it('迁移内置 16×20=320 张原创抽象技法卡，且来源权利状态先于索引', () => {
    const migrationPath = fileURLToPath(new URL('../../prisma/migrations/20260829070000_add_agent3_craft_library/migration.sql', import.meta.url))
    const migration = readFileSync(migrationPath, 'utf8')
    expect((migration.match(/\('(?:urban|workplace|suspense|romance|fantasy|xianxia|scifi|historical|period|school|family|crime|business|game|apocalypse|slice)'/g) ?? [])).toHaveLength(16)
    expect((migration.match(/\('(?:negotiation|confrontation|discovery|escape|reunion|betrayal|confession|farewell|investigation|training|combat|meal|arrival|decision|failure|victory|intimacy|argument|aftermath|transition)'/g) ?? [])).toHaveLength(20)
    expect(migration).toContain('"rights_status"')
    expect(migration).toContain("'approved'")
    expect(migration).toContain('不含第三方小说原文')
    expect(migration).toContain('FROM genres CROSS JOIN scenes')
  })
})
