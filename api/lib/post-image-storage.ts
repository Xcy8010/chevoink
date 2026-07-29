import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { transcodePostImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

const MANAGED_POST_IMAGE_PREFIX = '/api/uploads/post-images/'
const MAX_POST_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_POST_IMAGE_COUNT = 9

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedPostImageMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getPostImageDirectory() {
  return path.join(getUploadsRoot(), 'post-images')
}

function parsePostImageDataUrl(dataUrl: string): {
  mimeType: SupportedPostImageMimeType
  buffer: Buffer
} {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '讨论配图仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedPostImageMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '讨论配图不能为空。')
  }

  if (buffer.byteLength > MAX_POST_IMAGE_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '每张讨论配图不能超过 3MB。')
  }

  return { mimeType, buffer }
}

async function removeStoredPostImage(imageUrl: string): Promise<void> {
  if (!imageUrl.startsWith(MANAGED_POST_IMAGE_PREFIX)) {
    return
  }

  const filePath = path.join(getPostImageDirectory(), path.basename(imageUrl))

  // 同步清理约定式命名的缩略图（存在才删，失败不阻断）
  if (filePath.endsWith('.webp')) {
    await unlink(filePath.replace(/\.webp$/, '.thumb.webp')).catch(() => undefined)
  }

  try {
    await unlink(filePath)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }
}

/** 批量落盘发帖配图：任何一张失败时回滚已写入的文件 */
export async function storePostImageDataUrls(dataUrls: string[]): Promise<string[]> {
  if (dataUrls.length > MAX_POST_IMAGE_COUNT) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', `讨论配图最多上传 ${MAX_POST_IMAGE_COUNT} 张。`)
  }

  const imageDirectory = getPostImageDirectory()
  await mkdir(imageDirectory, { recursive: true })

  const storedUrls: string[] = []

  try {
    for (const dataUrl of dataUrls) {
      const { mimeType, buffer } = parsePostImageDataUrl(dataUrl)

      // 优先 sharp 转 WebP + 缩略图；失败时降级原样落盘
      const transcoded = await transcodePostImage(buffer)
      if (transcoded) {
        const filename = `${randomUUID()}.webp`
        await writeFile(path.join(imageDirectory, filename), transcoded.main)
        await writeFile(path.join(imageDirectory, filename.replace(/\.webp$/, '.thumb.webp')), transcoded.thumb)
        storedUrls.push(`${MANAGED_POST_IMAGE_PREFIX}${filename}`)
        continue
      }

      const filename = `${randomUUID()}.${MIME_TO_EXTENSION[mimeType]}`
      await writeFile(path.join(imageDirectory, filename), buffer)
      storedUrls.push(`${MANAGED_POST_IMAGE_PREFIX}${filename}`)
    }
  } catch (error) {
    await Promise.allSettled(storedUrls.map((url) => removeStoredPostImage(url)))
    throw error
  }

  return storedUrls
}
