import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { MAX_FEEDBACK_IMAGE_COUNT } from '../../shared/contracts/index.js'
import { env } from '../config/env.js'
import { transcodePostImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

const MANAGED_FEEDBACK_IMAGE_PREFIX = '/api/uploads/feedback-images/'
/**
 * 用户端原图上限 20MB，但一律先做 canvas 压缩再上传；
 * 服务端按「压缩产物」的口径二次设限，避免有人绕过前端直接塞 20MB base64 打爆请求体。
 */
const MAX_FEEDBACK_IMAGE_BYTES = 6 * 1024 * 1024

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedFeedbackImageMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getFeedbackImageDirectory() {
  return path.join(getUploadsRoot(), 'feedback-images')
}

function parseFeedbackImageDataUrl(dataUrl: string): {
  mimeType: SupportedFeedbackImageMimeType
  buffer: Buffer
} {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '反馈附图仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedFeedbackImageMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '反馈附图不能为空。')
  }

  if (buffer.byteLength > MAX_FEEDBACK_IMAGE_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '反馈附图体积过大，请重新选择图片。')
  }

  return { mimeType, buffer }
}

async function removeStoredFeedbackImage(imageUrl: string): Promise<void> {
  if (!imageUrl.startsWith(MANAGED_FEEDBACK_IMAGE_PREFIX)) {
    return
  }

  const filePath = path.join(getFeedbackImageDirectory(), path.basename(imageUrl))

  // 同步清理约定式命名的缩略图（存在才删，失败不阻断）
  if (filePath.endsWith('.webp')) {
    await unlink(filePath.replace(/\.webp$/, '.thumb.webp')).catch((): undefined => undefined)
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

/** 批量落盘反馈附图（含界面截图）：任何一张失败时回滚已写入的文件 */
export async function storeFeedbackImageDataUrls(dataUrls: string[]): Promise<string[]> {
  if (dataUrls.length > MAX_FEEDBACK_IMAGE_COUNT) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', `反馈附图最多上传 ${MAX_FEEDBACK_IMAGE_COUNT} 张。`)
  }

  const imageDirectory = getFeedbackImageDirectory()
  await mkdir(imageDirectory, { recursive: true })

  const storedUrls: string[] = []

  try {
    for (const dataUrl of dataUrls) {
      const { mimeType, buffer } = parseFeedbackImageDataUrl(dataUrl)

      // 优先 sharp 转 WebP + 缩略图；失败时降级原样落盘
      const transcoded = await transcodePostImage(buffer)
      if (transcoded) {
        const filename = `${randomUUID()}.webp`
        await writeFile(path.join(imageDirectory, filename), transcoded.main)
        await writeFile(path.join(imageDirectory, filename.replace(/\.webp$/, '.thumb.webp')), transcoded.thumb)
        storedUrls.push(`${MANAGED_FEEDBACK_IMAGE_PREFIX}${filename}`)
        continue
      }

      const filename = `${randomUUID()}.${MIME_TO_EXTENSION[mimeType]}`
      await writeFile(path.join(imageDirectory, filename), buffer)
      storedUrls.push(`${MANAGED_FEEDBACK_IMAGE_PREFIX}${filename}`)
    }
  } catch (error) {
    await Promise.allSettled(storedUrls.map((url) => removeStoredFeedbackImage(url)))
    throw error
  }

  return storedUrls
}
