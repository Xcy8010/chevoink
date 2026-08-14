import path from 'node:path'

import { DataAccessError } from './prisma.js'

/**
 * 上传文件文本提取（read_file 工具基座）：
 * txt/md 直读；pdf → pdf-parse；docx → mammoth；均动态 import 懒加载（启动零开销）。
 * 借鉴 anthropics/skills 的 pdf/docx 思路与 offset 续读参数设计，Node 纯 JS 实现。
 */

/** 单次提取返回的最大字符数（≈15k token，对齐 loop 上下文预算） */
export const FILE_EXTRACT_MAX_CHARS = 20000

export type FileExtractResult = {
  text: string
  totalChars: number
  truncated: boolean
}

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    const mod = await import('pdf-parse')
    // pdf-parse 为 CJS 默认导出；动态 import 在 ESM 下挂 default
    const pdfParse = (mod as { default?: unknown }).default as (
      data: Buffer,
    ) => Promise<{ text?: string }>
    const parsed = await pdfParse(buffer)
    return parsed.text ?? ''
  } catch {
    throw new DataAccessError(
      502,
      'FILE_EXTRACT_ERROR',
      'PDF 解析失败：文件可能损坏，或为扫描版（扫描件没有可提取文字层）。',
    )
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
  } catch {
    throw new DataAccessError(502, 'FILE_EXTRACT_ERROR', 'docx 解析失败：文件可能损坏或不是有效的 docx。')
  }
}

/** 按扩展名分发提取；offset 支持截断后续读 */
export async function extractFileText(
  buffer: Buffer,
  filename: string,
  offset = 0,
): Promise<FileExtractResult> {
  const extension = (path.extname(filename).slice(1) || '').toLowerCase()

  let full: string

  if (extension === 'txt' || extension === 'md') {
    full = buffer.toString('utf8')
  } else if (extension === 'pdf') {
    full = await extractPdf(buffer)
  } else if (extension === 'docx') {
    full = await extractDocx(buffer)
  } else if (extension === 'doc') {
    throw new DataAccessError(
      400,
      'VALIDATION_ERROR',
      '旧版 .doc 二进制格式无法解析，请转存为 .docx 后重新上传。',
    )
  } else {
    throw new DataAccessError(400, 'VALIDATION_ERROR', `暂不支持解析 .${extension} 文件。`)
  }

  const normalized = full.replace(/\r\n?/g, '\n').trim()
  const totalChars = normalized.length

  if (totalChars === 0) {
    return {
      text: '',
      totalChars: 0,
      truncated: false,
    }
  }

  const start = Math.min(Math.max(offset, 0), totalChars)
  const text = normalized.slice(start, start + FILE_EXTRACT_MAX_CHARS)

  return {
    text,
    totalChars,
    truncated: start + text.length < totalChars,
  }
}
