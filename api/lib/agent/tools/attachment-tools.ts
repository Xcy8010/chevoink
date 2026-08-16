import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import {
  getUploadsRootDirectory,
  MANAGED_AGENT_ATTACHMENT_PREFIX,
  resolveManagedAttachmentPath,
} from '../../agent-attachment-storage.js'
import { extractFileText } from '../../file-extract.js'
import { prisma } from '../../prisma.js'
import { describeImageWithVision } from '../../vision-service.js'
import { defineTool } from './types.js'

/**
 * 附件理解工具（视觉旁路 + 文件提取）：
 * DeepSeek 主模型是纯文本模型，view_image 把图片发给 GLM 视觉模型换回文字描述（ds-vision-skill 模式），
 * read_file 用 pdf-parse/mammoth 提取上传文件文本。两者均为只读、三模式放行。
 */

const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const

/** 封面候选图前缀（novel-cover-storage 内部常量，此处镜像用于 view_image 白名单） */
const NOVEL_COVER_PREFIX = '/api/uploads/novel-covers/'

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const MIME_ALLOWED = new Set(Object.values(EXT_TO_MIME))
const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024
/** 外网下载时限：生图 CDN 跨境较慢（实测 2MB+ 需 ~20s），放宽到 60s */
const REMOTE_FETCH_TIMEOUT_MS = 60000
const REMOTE_FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** 外网图片 URL 安全校验：仅 https、禁止 IP/localhost/内网段（防 SSRF 打云元数据/内网探测） */
function isSafeRemoteImageUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return false
  }
  // IPv4 字面量
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return false
  }
  // IPv6 字面量（hostname 含冒号）
  if (host.includes(':')) {
    return false
  }
  if (/^(10\.|192\.168\.|127\.|0\.|169\.254\.)/.test(host)) {
    return false
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return false
  }
  return true
}

/** 魔数嗅探：Content-Type/扩展名都不可靠时的兜底格式判定 */
function sniffImageMime(buffer: Buffer): string | null {
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

/** 下载外网图片：禁跳转、限时限体积、仅放行 png/jpeg/webp */
async function downloadRemoteImage(
  url: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isSafeRemoteImageUrl(url)) {
    return null
  }

  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      headers: { 'user-agent': REMOTE_FETCH_USER_AGENT },
      redirect: 'manual',
    })
  } catch {
    return null
  }

  if (!response.ok) {
    return null
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_REMOTE_IMAGE_BYTES) {
    return null
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const extMime = EXT_TO_MIME[(path.extname(new URL(url).pathname).slice(1) || '').toLowerCase()]

  const body = await response.arrayBuffer()
  if (!body.byteLength || body.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    return null
  }
  const buffer = Buffer.from(body)

  // 格式判定优先级：可信 Content-Type > 魔数嗅探 > 扩展名
  const mime = MIME_ALLOWED.has(contentType)
    ? contentType
    : (sniffImageMime(buffer) ?? extMime)

  if (!mime || !MIME_ALLOWED.has(mime)) {
    return null
  }

  return { buffer, mime }
}

/** URL → 磁盘绝对路径：仅放行本站附件与封面候选两个托管前缀（防 SSRF/越权读盘） */
function resolveReadableImagePath(url: string): string | null {
  if (url.startsWith(MANAGED_AGENT_ATTACHMENT_PREFIX)) {
    return resolveManagedAttachmentPath(url)
  }

  if (url.startsWith(NOVEL_COVER_PREFIX)) {
    const basename = path.basename(url)
    if (!basename || basename !== url.slice(NOVEL_COVER_PREFIX.length)) {
      return null
    }
    return path.join(getUploadsRootDirectory(), 'novel-covers', basename)
  }

  return null
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

export const viewImageTool = defineTool({
  name: 'view_image',
  title: '查看图片',
  description:
    '查看并理解一张图片（作者附带的参考图、cover_generate 返回的封面候选图、novel_get_context 返回的正式封面地址，含历史遗留的外网封面链接）。你是纯文本模型，看不到图片像素；本工具把图片发给视觉推理模型，返回文字描述。作者消息附带参考图时必须先逐张调用本工具理解图片再开始任务；cover_generate 生成封面后必须对每张候选调用本工具校验画面是否符合提示词；作者询问当前封面效果时用正式封面地址调用本工具查看。url 接受本站附件/封面地址、封面候选的 coverAssetId 或 https 外网图片地址。',
  parameters: z.object({
    url: z
      .string()
      .describe('图片地址（作者附件 url、cover_generate 候选图 url 或 coverAssetId、正式封面 url 或 https 外网图片 url）'),
    focus: z
      .string()
      .max(500)
      .optional()
      .describe('查看重点（如：校验封面主体/文字是否乱码/构图是否符合提示词）；缺省为通用详细描述'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    let buffer: Buffer | null = null
    let mime: string | undefined
    // display 用真实图片地址：入参可能是 coverAssetId（UUID），直接展示会 404 破图
    let displayUrl = args.url

    if (args.url.startsWith('http://') || args.url.startsWith('https://')) {
      // 外网图片（历史 AI 生图直存的远程封面等）：安全校验后下载
      const remote = await downloadRemoteImage(args.url)
      if (!remote) {
        return {
          output:
            'view_image 失败：该外网图片不可达、过大或不是 png/jpg/webp（仅允许 https 公网域名，禁止内网/IP 地址）。可基于文字信息继续任务，并向作者如实说明。',
        }
      }
      buffer = remote.buffer
      mime = remote.mime
    } else {
      let diskPath = resolveReadableImagePath(args.url)

      if (!diskPath) {
        // 容错：历史压缩可能只剩 coverAssetId，按归属反查候选图 url（防越权：仅限本人资源）
        const asset = await prisma.coverAsset.findFirst({
          where: { id: args.url, ownerUserId: ctx.userId },
          select: { imageUrl: true },
        })

        if (asset) {
          diskPath = resolveReadableImagePath(asset.imageUrl)
          displayUrl = asset.imageUrl
        }
      }

      if (!diskPath) {
        return {
          output: `view_image 被拒绝：${args.url} 不是可读图片地址（仅允许本会话附件、封面候选、封面候选 coverAssetId 或 https 外网图片）。请使用附件元数据、cover_generate 或 novel_get_context 返回的 url 或 coverAssetId。`,
        }
      }

      try {
        buffer = await readFile(diskPath)
      } catch {
        return { output: 'view_image 失败：图片文件不存在或已失效，请作者重新发送附件。' }
      }

      mime = EXT_TO_MIME[(path.extname(diskPath).slice(1) || '').toLowerCase()]

      if (!mime) {
        return { output: 'view_image 失败：该地址不是支持的图片格式（png/jpg/webp）。' }
      }
    }

    try {
      const description = await describeImageWithVision(
        { buffer, mime },
        args.focus?.trim() ||
          '请详细描述这张图片的内容：主体、场景、文字（如有，逐字列出）、构图与风格，供网文写作与封面校验参考。',
      )

      return {
        output: `图片观察结果：${description}`,
        summary: '查看 1 张图片',
        display: {
          kind: 'viewedImage',
          images: [{ id: path.basename(displayUrl), url: displayUrl }],
          description,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        output: `view_image 失败：${message}。可基于文字信息继续任务，并向作者如实说明本次未能查看图片。`,
      }
    }
  },
})

export const readFileTool = defineTool({
  name: 'read_file',
  title: '读取文件',
  description:
    '读取作者随消息上传的文件内容（pdf/docx/txt/md）。作者附带文件时必须先调用本工具理解内容再行动，禁止凭文件名猜测。返回提取的纯文本（单次最多 20000 字符，超出时用 offset 参数续读）。',
  parameters: z.object({
    url: z.string().describe('文件地址（作者附件元数据中的 url）'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('字符偏移：上次返回提示截断时，传该偏移续读后续内容'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(_ctx, args) {
    const diskPath = resolveManagedAttachmentPath(args.url)

    if (!diskPath) {
      return {
        output: `read_file 被拒绝：${args.url} 不是本会话上传的附件地址。请使用作者附件元数据中的 url。`,
      }
    }

    let buffer: Buffer
    try {
      buffer = await readFile(diskPath)
    } catch {
      return { output: 'read_file 失败：文件不存在或已失效，请作者重新发送。' }
    }

    try {
      const result = await extractFileText(buffer, path.basename(diskPath), args.offset ?? 0)

      if (result.totalChars === 0) {
        return {
          output:
            'read_file：未提取到任何文本。若为扫描版 PDF（图片扫描件），没有文字层，可如实告知作者。',
          summary: '读取文件（无文本）',
        }
      }

      const offset = args.offset ?? 0
      const tailNote = result.truncated
        ? `（已截断：本次返回第 ${offset}-${offset + result.text.length} 字符，全文共 ${result.totalChars} 字符；需要后续内容请再次调用 read_file 并传 offset=${offset + result.text.length}）`
        : `（全文共 ${result.totalChars} 字符，已完整返回）`

      return {
        output: `文件内容提取结果${tailNote}：\n"""\n${result.text}\n"""`,
        summary: `读取文件 · ${result.text.length} 字`,
        display: { kind: 'markdown', markdown: clip(result.text, 2000) },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { output: `read_file 失败：${message}` }
    }
  },
})
