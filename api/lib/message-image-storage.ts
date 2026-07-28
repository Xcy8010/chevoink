import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

const MANAGED_MESSAGE_IMAGE_PREFIX = '/api/uploads/message-images/'
const MAX_MESSAGE_IMAGE_BYTES = 5 * 1024 * 1024

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedMessageImageMimeType = keyof typeof MIME_TO_EXTENSION

function getUploadsRoot() {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getMessageImageDirectory() {
  return path.join(getUploadsRoot(), 'message-images')
}

function parseMessageImageDataUrl(dataUrl: string): {
  mimeType: SupportedMessageImageMimeType
  buffer: Buffer
} {
  const normalized = dataUrl.trim()
  const matched = normalized.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '图片消息仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedMessageImageMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '图片内容不能为空。')
  }

  if (buffer.byteLength > MAX_MESSAGE_IMAGE_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '图片不能超过 5MB。')
  }

  return { mimeType, buffer }
}

/** 私信图片落盘：入参为 base64 数据 URL，返回 /api/uploads/message-images/ 下的可访问地址 */
export async function storeMessageImageDataUrl(dataUrl: string): Promise<string> {
  const { mimeType, buffer } = parseMessageImageDataUrl(dataUrl)
  const imageDirectory = getMessageImageDirectory()
  const extension = MIME_TO_EXTENSION[mimeType]
  const filename = `${randomUUID()}.${extension}`

  await mkdir(imageDirectory, { recursive: true })
  await writeFile(path.join(imageDirectory, filename), buffer)

  return `${MANAGED_MESSAGE_IMAGE_PREFIX}${filename}`
}
