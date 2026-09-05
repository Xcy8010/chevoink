import { randomInt, randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { initializeNewUserCredits } from '../../api/lib/credits.js'
import { createUnsetPasswordHash } from '../../api/lib/password.js'
import { prisma } from '../../api/lib/prisma.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)

afterAll(async () => {
  await prisma.$disconnect().catch(() => {})
})

/**
 * 全局暂停继承回归：注册事务的建账点必须读取全局暂停状态并写入 suspendedAt。
 * 历史缺陷：注册事务直接 creditAccount.create 漏写 suspendedAt，暂停期间注册的新用户
 * 显示「正常」且绕过计费门禁（ensure 路径的 upsert create 分支因行已存在而永不生效）。
 * 暂停开关只在回滚事务内修改，对并行运行的其他测试不可见、不留残留。
 */
describe.skipIf(!dbAvailable)('Credits 全局暂停继承（需 DB）', () => {
  async function createRegistrationAccountRolledBack(globallyPaused: boolean): Promise<Date | null> {
    const unique = randomInt(0, 10_000_000).toString().padStart(7, '0')
    const sentinel = new Error('rollback-only')
    let suspendedAt: Date | null = null
    await expect(prisma.$transaction(async (tx) => {
      await tx.creditSystemSetting.upsert({
        where: { id: 'global' },
        create: { id: 'global', globallyPaused, dailyAllowanceMilli: 450_000, resetHourUtc8: 15 },
        update: { globallyPaused },
      })
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          phone: `+861379${unique}`,
          passwordHash: createUnsetPasswordHash(),
          nickname: `暂停继承${unique}`,
          role: 'user',
          isAuthor: false,
        },
      })
      await initializeNewUserCredits(tx, user.id)
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: user.id } })
      suspendedAt = account.suspendedAt
      throw sentinel
    })).rejects.toBe(sentinel)
    return suspendedAt
  }

  it('全局暂停期间注册事务创建的账户必须继承暂停状态', async () => {
    expect(await createRegistrationAccountRolledBack(true)).toBeInstanceOf(Date)
  })

  it('未开启全局暂停时注册事务创建的账户保持正常', async () => {
    expect(await createRegistrationAccountRolledBack(false)).toBeNull()
  })
})
