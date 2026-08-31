import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  AGENT_FILE_EXTENSIONS,
  MAX_AGENT_FILE_BYTES_DOC,
  MAX_AGENT_FILE_BYTES_PDF,
  MAX_AGENT_IMAGE_BYTES,
  type AgentAttachmentKind,
  type AgentAttachmentMeta,
} from '../../shared/contracts/agent-attachments.js'
import { env } from '../config/env.js'
import { transcodePostImage } from './image-transcode.js'
import { DataAccessError } from './prisma.js'

/**
 * Agent 对话附件存储（图片/文件）：克隆 post-image-storage 范式。
 * 附件 URL 被用户气泡与 view_image 卡片持久引用，永久保留不自动清理。
 */

export const MANAGED_AGENT_ATTACHMENT_PREFIX = '/api/uploads/agent-attachments/'

const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

type SupportedImageMimeType = keyof typeof MIME_TO_EXTENSION

export function getUploadsRootDirectory(): string {
  return env.appEnv === 'production'
    ? path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
    : path.resolve(process.cwd(), '.local-storage', 'uploads')
}

function getAttachmentDirectory(): string {
  return path.join(getUploadsRootDirectory(), 'agent-attachments')
}

/** URL → 磁盘绝对路径：仅接受托管前缀且 basename 与 URL 尾部严格一致（防路径穿越），否则 null */
export function resolveManagedAttachmentPath(url: string): string | null {
  if (!url.startsWith(MANAGED_AGENT_ATTACHMENT_PREFIX)) {
    return null
  }
  const basename = path.basename(url)
  if (!basename || basename !== url.slice(MANAGED_AGENT_ATTACHMENT_PREFIX.length)) {
    return null
  }
  return path.join(getAttachmentDirectory(), basename)
}

/** 仅供已声明视觉能力的主模型直传；仍复用本站托管前缀白名单，绝不接受任意路径或 URL。 */
export async function readManagedImageDataUrl(url: string): Promise<string | null> {
  const diskPath = resolveManagedAttachmentPath(url)
  if (!diskPath) return null
  const extension = path.extname(diskPath).slice(1).toLowerCase()
  const mime = extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : null
  if (!mime) return null
  try {
    const buffer = await readFile(diskPath)
    if (!buffer.length || buffer.byteLength > MAX_AGENT_IMAGE_BYTES) return null
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function parseImageDataUrl(dataUrl: string): { mimeType: SupportedImageMimeType; buffer: Buffer } {
  const matched = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '参考图仅支持 PNG、JPG 或 WebP 图片。')
  }

  const mimeType = matched[1] as SupportedImageMimeType
  const buffer = Buffer.from(matched[2], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '参考图不能为空。')
  }

  if (buffer.byteLength > MAX_AGENT_IMAGE_BYTES) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '每张参考图不能超过 5MB。')
  }

  return { mimeType, buffer }
}

function parseFileDataUrl(dataUrl: string, name: string): { extension: string; buffer: Buffer } {
  const matched = dataUrl.trim().match(/^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/)

  if (!matched) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '文件内容无效，请重新选择后上传。')
  }

  const buffer = Buffer.from(matched[1], 'base64')

  if (!buffer.length) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '文件不能为空。')
  }

  const extension = (path.extname(name).slice(1) || '').toLowerCase()

  if (extension === 'doc') {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '暂不支持旧版 .doc 格式，请转存为 .docx 后重新上传。')
  }

  if (!(AGENT_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '文件仅支持 pdf、docx、txt、md 格式。')
  }

  const maxBytes = extension === 'pdf' ? MAX_AGENT_FILE_BYTES_PDF : MAX_AGENT_FILE_BYTES_DOC

  if (buffer.byteLength > maxBytes) {
    throw new DataAccessError(
      400,
      'VALIDATION_ERROR',
      extension === 'pdf' ? '单个 PDF 不能超过 10MB。' : '单个文件不能超过 5MB。',
    )
  }

  return { extension, buffer }
}

/** 单附件落盘：图片优先 sharp 转 WebP（失败降级原样），文件原样落盘；返回元数据供 run 请求携带 */
export async function storeAgentAttachment(input: {
  kind: AgentAttachmentKind
  name: string
  dataUrl: string
}): Promise<AgentAttachmentMeta> {
  const directory = getAttachmentDirectory()
  await mkdir(directory, { recursive: true })

  const id = randomUUID()

  if (input.kind === 'image') {
    const { mimeType, buffer } = parseImageDataUrl(input.dataUrl.trim())

    // 优先 sharp 转 WebP 压缩体积（视觉模型不需要原图体积）；失败时降级原样落盘
    const transcoded = await transcodePostImage(buffer)

    if (transcoded) {
      const filename = `${id}.webp`
      await writeFile(path.join(directory, filename), transcoded.main)
      return {
        id,
        kind: 'image',
        name: input.name,
        url: `${MANAGED_AGENT_ATTACHMENT_PREFIX}${filename}`,
        size: transcoded.main.byteLength,
      }
    }

    const filename = `${id}.${MIME_TO_EXTENSION[mimeType]}`
    await writeFile(path.join(directory, filename), buffer)
    return {
      id,
      kind: 'image',
      name: input.name,
      url: `${MANAGED_AGENT_ATTACHMENT_PREFIX}${filename}`,
      size: buffer.byteLength,
    }
  }

  const { extension, buffer } = parseFileDataUrl(input.dataUrl, input.name)
  const filename = `${id}.${extension}`
  await writeFile(path.join(directory, filename), buffer)

  return {
    id,
    kind: 'file',
    name: input.name,
    url: `${MANAGED_AGENT_ATTACHMENT_PREFIX}${filename}`,
    size: buffer.byteLength,
  }
}
