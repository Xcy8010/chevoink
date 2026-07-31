import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

const MANAGED_AVATAR_PREFIX = '/api/uploads/avatars/'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedAvatarMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getAvatarDirectory() {
  return path.join(getUploadsRoot(), 'avatars')
}

function parseAvatarDataUrl(dataUrl: string): { mimeType: SupportedAvatarMimeType; buffer: Buffer } {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '头像仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedAvatarMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '头像图片不能为空。')
  }

  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '头像图片不能超过 2MB。')
  }

  return { mimeType, buffer }
}

export function getUploadsStaticDirectory() {
  return getUploadsRoot()
}

export async function storeAvatarDataUrl(dataUrl: string): Promise<string> {
  const { mimeType, buffer } = parseAvatarDataUrl(dataUrl)
  const avatarDirectory = getAvatarDirectory()
  const extension = MIME_TO_EXTENSION[mimeType]
  const filename = `${randomUUID()}.${extension}`

  await mkdir(avatarDirectory, { recursive: true })
  await writeFile(path.join(avatarDirectory, filename), buffer)

  return `${MANAGED_AVATAR_PREFIX}${filename}`
}

export async function removeManagedAvatar(avatarUrl: string | null | undefined): Promise<void> {
  if (!avatarUrl) {
    return
  }

  const pathname = avatarUrl.startsWith('http')
    ? new URL(avatarUrl).pathname
    : avatarUrl

  if (!pathname.startsWith(MANAGED_AVATAR_PREFIX)) {
    return
  }

  const filename = path.basename(pathname)
  const avatarFilePath = path.join(getAvatarDirectory(), filename)

  try {
    await unlink(avatarFilePath)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }
}
