import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { transcodeCoverImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

const MANAGED_NOVEL_COVER_PREFIX = '/api/uploads/novel-covers/'
const MAX_NOVEL_COVER_BYTES = 3 * 1024 * 1024

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedNovelCoverMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getNovelCoverDirectory() {
  return path.join(getUploadsRoot(), 'novel-covers')
}

function parseNovelCoverDataUrl(dataUrl: string): {
  mimeType: SupportedNovelCoverMimeType
  buffer: Buffer
} {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '作品封面仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedNovelCoverMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '作品封面图片不能为空。')
  }

  if (buffer.byteLength > MAX_NOVEL_COVER_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '作品封面图片不能超过 3MB。')
  }

  return { mimeType, buffer }
}

export async function storeNovelCoverDataUrl(dataUrl: string): Promise<string> {
  const { mimeType, buffer } = parseNovelCoverDataUrl(dataUrl)
  const coverDirectory = getNovelCoverDirectory()

  await mkdir(coverDirectory, { recursive: true })

  // 优先 sharp 转 WebP + 缩略图；失败时降级原样落盘
  const transcoded = await transcodeCoverImage(buffer)
  if (transcoded) {
    const filename = `${randomUUID()}.webp`
    await writeFile(path.join(coverDirectory, filename), transcoded.main)
    await writeFile(path.join(coverDirectory, filename.replace(/\.webp$/, '.thumb.webp')), transcoded.thumb)
    return `${MANAGED_NOVEL_COVER_PREFIX}${filename}`
  }

  const extension = MIME_TO_EXTENSION[mimeType]
  const filename = `${randomUUID()}.${extension}`
  await writeFile(path.join(coverDirectory, filename), buffer)

  return `${MANAGED_NOVEL_COVER_PREFIX}${filename}`
}
