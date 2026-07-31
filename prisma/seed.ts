import dotenv from 'dotenv'
import { PrismaClient, type UserRole } from '@prisma/client'

import { hashPassword } from '../api/lib/password.js'

dotenv.config({ override: true })

const prisma = new PrismaClient()

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

async function ensureBootstrapOwner() {
  const email = readOptionalEnv('SEED_OWNER_EMAIL')
  const phone = readOptionalEnv('SEED_OWNER_PHONE')
  const nickname = readOptionalEnv('SEED_OWNER_NICKNAME')
  const password = readOptionalEnv('SEED_OWNER_PASSWORD')
  const role = (readOptionalEnv('SEED_OWNER_ROLE') ?? 'admin') as UserRole
  const bio = readOptionalEnv('SEED_OWNER_BIO')

  if (!email && !phone) {
    console.log('[chevoink] skip seed: 未提供 SEED_OWNER_EMAIL / SEED_OWNER_PHONE，不再写入演示数据。')
    return
  }

  if (!nickname || !password) {
    throw new Error('缺少 SEED_OWNER_NICKNAME 或 SEED_OWNER_PASSWORD，无法创建初始账号。')
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
  })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        nickname,
        passwordHash: hashPassword(password),
        bio,
        role,
        isAuthor: role !== 'user',
      },
    })

    console.log(`[chevoink] bootstrap owner refreshed: ${nickname}`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      phone,
      nickname,
      passwordHash: hashPassword(password),
      bio,
      role,
      isAuthor: role !== 'user',
      followerCount: 0,
      followingCount: 0,
      novelCount: 0,
      postCount: 0,
      unreadMessageCount: 0,
      unreadNotificationCount: 0,
    },
  })

  console.log(`[chevoink] bootstrap owner created: ${nickname}`)
}

async function main() {
  await ensureBootstrapOwner()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
