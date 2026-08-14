import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { transcodeCoverImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

const MANAGED_NOVEL_COVER_PREFIX = '/api/uploads/novel-covers/'
const MAX_NOVEL_COVER_BYTES = 3 * 1024 * 1024
/** 远程封面下载时限：生图 CDN 跨境较慢，放宽到 60s */
const REMOTE_COVER_FETCH_TIMEOUT_MS = 60000
const REMOTE_COVER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

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
  return writeCoverBuffer(mimeType, buffer)
}

/** 魔数嗅探远程封面格式：CDN 常回 application/octet-stream，不能信 Content-Type */
function sniffRemoteCoverMime(buffer: Buffer): SupportedNovelCoverMimeType | null {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

/** 下载远程封面（生图服务直链）并落盘为本站静态地址；失败抛错由调用方降级保留原 URL */
export async function storeNovelCoverFromRemoteUrl(remoteUrl: string): Promise<string> {
  const response = await fetch(remoteUrl, {
    signal: AbortSignal.timeout(REMOTE_COVER_FETCH_TIMEOUT_MS),
    headers: { 'user-agent': REMOTE_COVER_USER_AGENT },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`远程封面下载失败：HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  if (!buffer.byteLength || buffer.byteLength > MAX_NOVEL_COVER_BYTES) {
    throw new Error('远程封面为空或超过 3MB。')
  }

  const mimeType = sniffRemoteCoverMime(buffer)
  if (!mimeType) {
    throw new Error('远程封面不是支持的 png/jpg/webp 图片。')
  }

  return writeCoverBuffer(mimeType, buffer)
}

async function writeCoverBuffer(
  mimeType: SupportedNovelCoverMimeType,
  buffer: Buffer,
): Promise<string> {
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
