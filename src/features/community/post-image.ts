/** 发帖配图的前端预处理：类型/大小校验 + canvas 压缩为 data URL */

export const MAX_POST_IMAGE_COUNT = 9

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 3 * 1024 * 1024
/** 目标体积：超过则重新编码压缩，避免 MB 级原图直传 */
const TARGET_OUTPUT_IMAGE_BYTES = 300 * 1024
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
function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

/**
 * 校验并压缩一张发帖配图，返回 base64 data URL。
 * 超过 1600px 的长边会被等比缩小，体积超 300KB 时重编码压缩。
 */
export async function preparePostImage(file: File): Promise<string> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('配图仅支持 PNG、JPG 或 WebP 图片。')
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('单张配图不能超过 8MB。')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(sourceDataUrl)
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight)

  // 尺寸和体积都在目标内时直接用原图，保留原始格式
  if (longEdge <= MAX_EDGE_PX && estimateDataUrlBytes(sourceDataUrl) <= TARGET_OUTPUT_IMAGE_BYTES) {
    return sourceDataUrl
  }

  const scale = Math.min(1, MAX_EDGE_PX / longEdge)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器不支持图片压缩。')
  }

  // JPEG 不支持透明通道，先铺白底避免透明区域变黑
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let fallback = ''
  for (const quality of [0.82, 0.7, 0.58]) {
    const output = canvas.toDataURL('image/jpeg', quality)
    if (estimateDataUrlBytes(output) <= TARGET_OUTPUT_IMAGE_BYTES) {
      return output
    }
    fallback = output
  }

  // 降到最低档仍超目标体积时，只要不超硬上限就接受（避免超高细节图无法发布）
  if (fallback && estimateDataUrlBytes(fallback) <= MAX_OUTPUT_IMAGE_BYTES) {
    return fallback
  }

  throw new Error('这张图片压缩后仍然过大，请换一张再试。')
}
