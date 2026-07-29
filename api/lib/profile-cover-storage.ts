import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { transcodeCoverImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

const MANAGED_PROFILE_COVER_PREFIX = '/api/uploads/profile-covers/'
const MAX_PROFILE_COVER_BYTES = 3 * 1024 * 1024

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedProfileCoverMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getProfileCoverDirectory() {
  return path.join(getUploadsRoot(), 'profile-covers')
}

function parseProfileCoverDataUrl(dataUrl: string): {
  mimeType: SupportedProfileCoverMimeType
  buffer: Buffer
} {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '封面仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedProfileCoverMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '封面图片不能为空。')
  }

  if (buffer.byteLength > MAX_PROFILE_COVER_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '封面图片不能超过 3MB。')
  }

  return { mimeType, buffer }
}

export async function storeProfileCoverDataUrl(dataUrl: string): Promise<string> {
  const { mimeType, buffer } = parseProfileCoverDataUrl(dataUrl)
  const profileCoverDirectory = getProfileCoverDirectory()

  await mkdir(profileCoverDirectory, { recursive: true })

  // 优先 sharp 转 WebP + 缩略图；失败时降级原样落盘
  const transcoded = await transcodeCoverImage(buffer)
  if (transcoded) {
    const filename = `${randomUUID()}.webp`
    await writeFile(path.join(profileCoverDirectory, filename), transcoded.main)
    await writeFile(path.join(profileCoverDirectory, filename.replace(/\.webp$/, '.thumb.webp')), transcoded.thumb)
    return `${MANAGED_PROFILE_COVER_PREFIX}${filename}`
  }

  const extension = MIME_TO_EXTENSION[mimeType]
  const filename = `${randomUUID()}.${extension}`
  await writeFile(path.join(profileCoverDirectory, filename), buffer)

  return `${MANAGED_PROFILE_COVER_PREFIX}${filename}`
}

export async function removeManagedProfileCover(profileCoverUrl: string | null | undefined): Promise<void> {
  if (!profileCoverUrl) {
    return
  }

  const pathname = profileCoverUrl.startsWith('http')
    ? new URL(profileCoverUrl).pathname
    : profileCoverUrl

  if (!pathname.startsWith(MANAGED_PROFILE_COVER_PREFIX)) {
    return
  }

  const filename = path.basename(pathname)
  const profileCoverFilePath = path.join(getProfileCoverDirectory(), filename)

  // 同步清理约定式命名的缩略图（存在才删，失败不阻断）
  if (filename.endsWith('.webp')) {
    await unlink(path.join(getProfileCoverDirectory(), filename.replace(/\.webp$/, '.thumb.webp'))).catch(() => undefined)
  }

  try {
    await unlink(profileCoverFilePath)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }
}
