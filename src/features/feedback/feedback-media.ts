/**
 * 反馈附图的前端预处理：
 * 1. captureViewportScreenshot —— 用 modern-screenshot 抓当前界面（弹窗自身用属性标记排除）
 * 2. prepareFeedbackImage —— 用户手选/拖入的图片做类型与体积校验 + canvas 压缩
 *
 * 原图上限 20MB，但一律压缩后再上传：20MB base64 约 27MB，直传会撑爆请求体。
 */

/** 带该属性的元素不会出现在自动截图里（反馈弹窗本身） */
export const FEEDBACK_CAPTURE_IGNORE_ATTR = 'data-feedback-capture-ignore'

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 4 * 1024 * 1024
/** 目标体积：超过则重新编码压缩，避免 MB 级原图直传 */
const TARGET_OUTPUT_IMAGE_BYTES = 600 * 1024
const MAX_EDGE_PX = 1600

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片文件失败。'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('读取图片内容失败。'))
    image.src = dataUrl
  })
}

/** 估算 data URL 对应的二进制字节数 */
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

function compressDataUrl(image: HTMLImageElement, targetBytes: number, hardLimitBytes: number): string | null {
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1, MAX_EDGE_PX / longEdge)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  // JPEG 不支持透明通道，先铺白底避免透明区域变黑
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let fallback = ''
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const output = canvas.toDataURL('image/jpeg', quality)
    if (estimateDataUrlBytes(output) <= targetBytes) {
      return output
    }
    fallback = output
  }

  // 降到最低档仍超目标体积时，只要不超硬上限就接受（避免超高细节图无法提交）
  return fallback && estimateDataUrlBytes(fallback) <= hardLimitBytes ? fallback : null
}

/** 校验并压缩一张反馈附图，返回 base64 data URL */
export async function prepareFeedbackImage(file: File): Promise<string> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('附图仅支持 PNG、JPG 或 WebP 图片。')
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('单张附图不能超过 20MB。')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(sourceDataUrl)
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight)

  // 尺寸和体积都在目标内时直接用原图，保留原始格式
  if (longEdge <= MAX_EDGE_PX && estimateDataUrlBytes(sourceDataUrl) <= TARGET_OUTPUT_IMAGE_BYTES) {
    return sourceDataUrl
  }

  const compressed = compressDataUrl(image, TARGET_OUTPUT_IMAGE_BYTES, MAX_OUTPUT_IMAGE_BYTES)
  if (!compressed) {
    throw new Error('这张图片压缩后仍然过大，请换一张再试。')
  }

  return compressed
}

/**
 * 抓取当前界面截图（失败返回 null，不阻断反馈提交）。
 * 反馈弹窗自身通过 FEEDBACK_CAPTURE_IGNORE_ATTR 排除，因此可以在弹窗打开后再调用。
 */
export async function captureViewportScreenshot(): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null
  }

  try {
    const { domToJpeg } = await import('modern-screenshot')
    const target = document.body
    const longEdge = Math.max(target.scrollWidth || window.innerWidth, target.scrollHeight || window.innerHeight)
    const backgroundColor = window.getComputedStyle(document.documentElement).backgroundColor || '#ffffff'

    const dataUrl = await domToJpeg(target, {
      // 全站只用系统字体，跳过 webfont 内嵌可省掉一整轮 CSS 抓取
      font: false,
      quality: 0.8,
      backgroundColor,
      scale: longEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longEdge : 1,
      timeout: 15000,
      filter: (node) => !(node instanceof Element && node.hasAttribute(FEEDBACK_CAPTURE_IGNORE_ATTR)),
    })

    if (!dataUrl.startsWith('data:image/')) {
      return null
    }

    if (estimateDataUrlBytes(dataUrl) <= MAX_OUTPUT_IMAGE_BYTES) {
      return dataUrl
    }

    // 极大界面：再走一轮 canvas 重编码收体积
    const image = await loadImage(dataUrl)
    return compressDataUrl(image, TARGET_OUTPUT_IMAGE_BYTES, MAX_OUTPUT_IMAGE_BYTES)
  } catch {
    // 截图是增值项：浏览器不支持或渲染失败时静默跳过
    return null
  }
}
