import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import {
  getUploadsRootDirectory,
  MANAGED_AGENT_ATTACHMENT_PREFIX,
  resolveManagedAttachmentPath,
} from '../../agent-attachment-storage.js'
import { extractFileText } from '../../file-extract.js'
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
    '查看并理解一张图片（作者附带的参考图或 cover_generate 返回的封面候选图）。你是纯文本模型，看不到图片像素；本工具把图片发给视觉推理模型，返回文字描述。作者消息附带参考图时必须先逐张调用本工具理解图片再开始任务；cover_generate 生成封面后必须对每张候选调用本工具校验画面是否符合提示词。url 只接受本站附件或封面地址（即附件元数据/cover_generate 返回的 url）。',
  parameters: z.object({
    url: z.string().describe('图片地址（作者附件 url 或 cover_generate 返回的候选图 url）'),
    focus: z
      .string()
      .max(500)
      .optional()
      .describe('查看重点（如：校验封面主体/文字是否乱码/构图是否符合提示词）；缺省为通用详细描述'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(_ctx, args) {
    const diskPath = resolveReadableImagePath(args.url)

    if (!diskPath) {
      return {
        output: `view_image 被拒绝：${args.url} 不是本站可读图片地址（仅允许本会话附件或封面候选）。请使用附件元数据或 cover_generate 返回的 url。`,
      }
    }

    let buffer: Buffer
    try {
      buffer = await readFile(diskPath)
    } catch {
      return { output: 'view_image 失败：图片文件不存在或已失效，请作者重新发送附件。' }
    }

    const mime = EXT_TO_MIME[(path.extname(diskPath).slice(1) || '').toLowerCase()]

    if (!mime) {
      return { output: 'view_image 失败：该地址不是支持的图片格式（png/jpg/webp）。' }
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
          images: [{ id: path.basename(args.url), url: args.url }],
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
