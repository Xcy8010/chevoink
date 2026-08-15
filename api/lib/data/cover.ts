/**
 * 封面资产域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import { randomUUID } from 'node:crypto'
import type { CoverAsset } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { ensureNovelOwner, ensureUserExists, toCoverAsset } from './internal.js'
import { normalizeCoverImageUrl } from './novel.js'



export async function createCoverAssetsData(input: {
  userId: string
  prompt: string
  count: number
  imageUrls: string[]
  modelName: string
  novelId?: string | null
  negativePrompt?: string | null
  width?: number | null
  height?: number | null
}): Promise<CoverAsset[]> {
  await ensureUserExists(input.userId)

  // AI 生成的封面先落盘转静态文件路径，避免 base64 大字段入库拖垮后续列表接口
  const normalizedImageUrls = await Promise.all(
    input.imageUrls.slice(0, input.count).map((imageUrl) => normalizeCoverImageUrl(imageUrl)),
  )

  const created = await prisma.$transaction(
    normalizedImageUrls.map((imageUrl) =>
      prisma.coverAsset.create({
        data: {
          id: randomUUID(),
          novelId: input.novelId ?? null,
          ownerUserId: input.userId,
          sourceType: 'ai_generated',
          imageUrl,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? null,
          modelName: input.modelName,
          width: input.width ?? null,
          height: input.height ?? null,
        },
      }),
    ),
  )

  return created.map(toCoverAsset)
}



export async function createUploadedCoverAssetData(input: {
  userId: string
  novelId: string
  imageUrl: string
  width?: number | null
  height?: number | null
}): Promise<CoverAsset> {
  await ensureNovelOwner(input.userId, input.novelId)

  const created = await prisma.coverAsset.create({
    data: {
      id: randomUUID(),
      novelId: input.novelId,
      ownerUserId: input.userId,
      sourceType: 'upload',
      imageUrl: input.imageUrl,
      prompt: null,
      negativePrompt: null,
      modelName: null,
      width: input.width ?? null,
      height: input.height ?? null,
    },
  })

  return toCoverAsset(created)
}
