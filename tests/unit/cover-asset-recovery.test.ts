import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), find: vi.fn(),
  normalize: vi.fn(), owner: vi.fn(), user: vi.fn() }))
vi.mock('../../api/lib/prisma.js', () => ({
  DataAccessError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  prisma: { $transaction: (items: Promise<unknown>[]) => Promise.all(items),
    coverAsset: { create: mocks.create, update: mocks.update, updateMany: mocks.updateMany, findFirst: mocks.find } },
}))
vi.mock('../../api/lib/data/internal.js', () => ({ ensureNovelOwner: mocks.owner, ensureUserExists: mocks.user, toCoverAsset: (asset: unknown) => asset }))
vi.mock('../../api/lib/data/novel.js', () => ({ normalizeCoverImageUrl: mocks.normalize }))
import { createCoverAssetsData, recoverCoverAssetStorageData } from '../../api/lib/data/cover.js'

const asset = { id: 'saved-asset', ownerUserId: 'user', imageUrl: 'https://provider.example/original.png' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue(asset)
  mocks.find.mockResolvedValue(asset)
  mocks.user.mockResolvedValue(undefined)
  mocks.owner.mockResolvedValue(undefined)
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.update.mockResolvedValue({ ...asset, imageUrl: '/uploads/cover.png' })
  mocks.normalize.mockResolvedValue('/uploads/cover.png')
})

describe('generated cover storage recovery', () => {
  it('commits original results before attempting local storage', async () => {
    mocks.normalize.mockImplementation(async () => {
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageUrl: asset.imageUrl }) }))
      return '/uploads/cover.png'
    })
    const result = await createCoverAssetsData({ userId: 'user', prompt: '封面', count: 1, imageUrls: [asset.imageUrl], modelName: 'actual-model' })
    expect(result[0].imageUrl).toBe('/uploads/cover.png')
    expect(mocks.create).toHaveBeenCalledOnce()
  })
  it('retains the committed provider result when the local URL update fails', async () => {
    mocks.update.mockRejectedValue(new Error('DB unavailable after download'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await createCoverAssetsData({ userId: 'user', prompt: '封面', count: 1, imageUrls: [asset.imageUrl], modelName: 'actual-model' })
      expect(result[0].imageUrl).toBe(asset.imageUrl)
      expect(mocks.create).toHaveBeenCalledOnce()
    } finally { warning.mockRestore() }
  })
  it('recovers the same owned asset without creating another candidate', async () => {
    mocks.find.mockResolvedValueOnce(asset).mockResolvedValueOnce({ ...asset, imageUrl: '/uploads/cover.png' })
    expect((await recoverCoverAssetStorageData('user', asset.id)).imageUrl).toBe('/uploads/cover.png')
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: asset.id, ownerUserId: 'user', imageUrl: asset.imageUrl }, data: { imageUrl: '/uploads/cover.png' } })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not download an unowned or deleted asset', async () => {
    mocks.find.mockResolvedValue(null)
    await expect(recoverCoverAssetStorageData('other-user', asset.id)).rejects.toMatchObject({ code: 'COVER_ASSET_NOT_FOUND' })
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: asset.id, ownerUserId: 'other-user' } })
    expect(mocks.normalize).not.toHaveBeenCalled()
  })
})
