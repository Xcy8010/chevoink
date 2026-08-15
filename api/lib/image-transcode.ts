/**
 * 后端图片转码管线（sharp）：落盘统一转 WebP 并生成缩略图。
 * sharp 含原生二进制，生产安装可能受阻——模块懒加载，加载失败时返回 null，
 * 调用方降级为原样落盘（前端 canvas 压缩已兜住 90% 的体积问题）。
 */

import type SharpNamespace from 'sharp'

const WEBP_QUALITY = 80
/** 头像 trim 后内容面积低于原图该比例时放弃 trim（防误裁纯色背景照片），只做 flatten */
const AVATAR_TRIM_MIN_AREA_RATIO = 0.4
/** trim 判定容差：与边缘基准色的差值阈值 */
const AVATAR_TRIM_THRESHOLD = 48

type SharpModule = typeof SharpNamespace

let sharpModulePromise: Promise<SharpModule | null> | null = null

function loadSharp(): Promise<SharpModule | null> {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp')
      .then((mod) => mod.default)
      .catch((error): null => {
        console.warn('[image-transcode] sharp 加载失败，图片将原样落盘：', error)
        return null
      })
  }
  return sharpModulePromise
}

export type TranscodedImage = {
  /** WebP 主图 */
  main: Buffer
  /** WebP 缩略图 */
  thumb: Buffer
}

/**
 * 头像：trim 透明/纯色边距 + flatten 白底 + 512px 内缩放转 WebP，缩略图 128px。
 */
export async function transcodeAvatarImage(buffer: Buffer): Promise<TranscodedImage | null> {
  const sharp = await loadSharp()
  if (!sharp) {
    return null
  }

  try {
    const metadata = await sharp(buffer).metadata()
    const sourceArea = (metadata.width ?? 0) * (metadata.height ?? 0)

    // 先 flatten 白底（透明边距变白），再按容差 trim 掉四周近似纯色边距
    let base = sharp(buffer).flatten({ background: '#ffffff' })
    if (sourceArea > 0) {
      const trimmed = await sharp(await base.toBuffer())
        .trim({ threshold: AVATAR_TRIM_THRESHOLD })
        .toBuffer({ resolveWithObject: true })
        .catch((): null => null)

      // 裁切过狠（可能是纯色背景的正常照片）时放弃 trim
      if (trimmed && trimmed.info.width * trimmed.info.height >= sourceArea * AVATAR_TRIM_MIN_AREA_RATIO) {
        base = sharp(trimmed.data)
      }
    }

    const flattenedBuffer = await base.toBuffer()
    const main = await sharp(flattenedBuffer)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    const thumb = await sharp(flattenedBuffer)
      .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    return { main, thumb }
  } catch (error) {
    console.warn('[image-transcode] 头像转码失败，原样落盘：', error)
    return null
  }
}

/**
 * 作品/个人封面：等比缩放到 900×1200 内转 WebP，缩略图宽 320。
 */
export async function transcodeCoverImage(buffer: Buffer): Promise<TranscodedImage | null> {
  const sharp = await loadSharp()
  if (!sharp) {
    return null
  }

  try {
    const flattened = sharp(buffer).flatten({ background: '#ffffff' })
    const flattenedBuffer = await flattened.toBuffer()
    const main = await sharp(flattenedBuffer)
      .resize(900, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    const thumb = await sharp(flattenedBuffer)
      .resize(320, undefined, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    return { main, thumb }
  } catch (error) {
    console.warn('[image-transcode] 封面转码失败，原样落盘：', error)
    return null
  }
}

/**
 * 帖子配图：长边 1600 内转 WebP，缩略图宽 480。
 */
export async function transcodePostImage(buffer: Buffer): Promise<TranscodedImage | null> {
  const sharp = await loadSharp()
  if (!sharp) {
    return null
  }

  try {
    const flattened = sharp(buffer).flatten({ background: '#ffffff' })
    const flattenedBuffer = await flattened.toBuffer()
    const main = await sharp(flattenedBuffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    const thumb = await sharp(flattenedBuffer)
      .resize(480, undefined, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    return { main, thumb }
  } catch (error) {
    console.warn('[image-transcode] 帖子配图转码失败，原样落盘：', error)
    return null
  }
}
