import { buildApiUrl } from '@/app/api-base'
import { buildAuthHeader } from '@/lib/auth-token'

/** 一键导出选项：与后端 exportNovelSchema 对齐 */
export type NovelExportRequest = {
  includePlans: boolean
  includeCatalog: boolean
  includeInfo: boolean
  includeChapters: boolean
  chapterIds?: string[]
}

/** 从 Content-Disposition 解析下载文件名（优先 RFC5987 UTF-8 编码） */
function parseDownloadFileName(disposition: string | null): string | null {
  if (!disposition) return null

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return null
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition)
  return plainMatch ? plainMatch[1].trim() : null
}

/** 触发浏览器保存 Blob 文件 */
export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 下载已发起后再回收 Blob URL，留 1 秒余量兼容慢盘
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 请求服务端组装 zip 并直接触发下载；错误体解析后端中文文案抛出 */
export async function downloadNovelExportZip(novelId: string, options: NovelExportRequest): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/novels/${novelId}/export`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeader(),
    },
    body: JSON.stringify(options),
  })

  if (!response.ok) {
    let message = '导出失败，请稍后重试。'

    try {
      const payload = (await response.json()) as { error?: { message?: string } }
      if (payload?.error?.message) {
        message = payload.error.message
      }
    } catch {
      // 非 JSON 错误体保持兜底文案
    }

    throw new Error(message)
  }

  const blob = await response.blob()
  const fileName = parseDownloadFileName(response.headers.get('Content-Disposition')) ?? '作品一键导出.zip'

  triggerBlobDownload(blob, fileName)
}
