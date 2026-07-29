/**
 * 存量图片 WebP 迁移脚本（服务器上运行）：
 *   node scripts/migrate-images-webp.mjs [uploadsRoot]
 *
 * 扫描 uploads/{avatars,novel-covers,post-images,profile-covers} 下的 png/jpg/jpeg，
 * 生成 `<原文件全名>.webp`（如 a.jpg → a.jpg.webp）与 `<原文件全名>.thumb.webp`，
 * 配合 nginx `try_files $uri.webp $uri =404;`，旧 URL 无需改库即可优先命中 WebP。
 * 原文件保留不动；已存在产物的文件跳过，可安全重复执行。
 * avatars 目录额外做 flatten 白底 + trim 边距（治理存量“灰圈”头像）。
 */

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { existsSync } from 'node:fs'

const WEBP_QUALITY = 80
const AVATAR_TRIM_THRESHOLD = 48
const AVATAR_TRIM_MIN_AREA_RATIO = 0.4
const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

/** 各目录的主图/缩略图尺寸（与 api/lib/image-transcode.ts 保持一致） */
const DIRECTORY_PROFILES = {
  avatars: { main: { width: 512, height: 512 }, thumbWidth: 128, avatarTrim: true },
  'novel-covers': { main: { width: 900, height: 1200 }, thumbWidth: 320, avatarTrim: false },
  'post-images': { main: { width: 1600, height: 1600 }, thumbWidth: 480, avatarTrim: false },
  'profile-covers': { main: { width: 900, height: 1200 }, thumbWidth: 320, avatarTrim: false },
}

function resolveUploadsRoot() {
  const argRoot = process.argv[2]
  if (argRoot) {
    return path.resolve(argRoot)
  }
  const productionRoot = path.resolve(process.cwd(), '..', '..', 'shared', 'uploads')
  if (existsSync(productionRoot)) {
    return productionRoot
  }
  return path.resolve(process.cwd(), '.local-storage', 'uploads')
}

async function loadSharp() {
  try {
    const mod = await import('sharp')
    return mod.default
  } catch (error) {
    console.error('[migrate] sharp 加载失败，无法迁移：', error.message)
    process.exit(1)
  }
}

/** avatars：flatten 白底 → trim 边距（裁切过狠则放弃）→ 返回处理后的 buffer */
async function prepareAvatarBuffer(sharp, buffer) {
  const metadata = await sharp(buffer).metadata()
  const sourceArea = (metadata.width ?? 0) * (metadata.height ?? 0)
  const flattened = await sharp(buffer).flatten({ background: '#ffffff' }).toBuffer()

  if (sourceArea > 0) {
    const trimmed = await sharp(flattened)
      .trim({ threshold: AVATAR_TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true })
      .catch(() => null)
    if (trimmed && trimmed.info.width * trimmed.info.height >= sourceArea * AVATAR_TRIM_MIN_AREA_RATIO) {
      return trimmed.data
    }
  }
  return flattened
}

async function migrateDirectory(sharp, uploadsRoot, directoryName, profile, stats) {
  const directory = path.join(uploadsRoot, directoryName)
  let entries
  try {
    entries = await readdir(directory)
  } catch {
    console.log(`[migrate] 目录不存在，跳过：${directory}`)
    return
  }

  for (const entry of entries) {
    const extension = path.extname(entry).toLowerCase()
    if (!SOURCE_EXTENSIONS.has(extension)) {
      continue
    }

    const sourcePath = path.join(directory, entry)
    const mainPath = `${sourcePath}.webp`
    const thumbPath = `${sourcePath}.thumb.webp`
    if (existsSync(mainPath)) {
      stats.skipped += 1
      continue
    }

    try {
      const fileStat = await stat(sourcePath)
      if (!fileStat.isFile()) {
        continue
      }

      let base = sharp(sourcePath)
      if (profile.avatarTrim) {
        const sourceBuffer = await sharp(sourcePath).toBuffer()
        base = sharp(await prepareAvatarBuffer(sharp, sourceBuffer))
      } else {
        base = sharp(await base.flatten({ background: '#ffffff' }).toBuffer())
      }

      const baseBuffer = await base.toBuffer()
      await sharp(baseBuffer)
        .resize(profile.main.width, profile.main.height, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(mainPath)
      await sharp(baseBuffer)
        .resize(profile.thumbWidth, undefined, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(thumbPath)

      stats.migrated += 1
      console.log(`[migrate] ok  ${directoryName}/${entry}`)
    } catch (error) {
      stats.failed += 1
      console.warn(`[migrate] fail ${directoryName}/${entry}: ${error.message}`)
    }
  }
}

async function main() {
  const uploadsRoot = resolveUploadsRoot()
  console.log(`[migrate] uploads 根目录：${uploadsRoot}`)

  const sharp = await loadSharp()
  const stats = { migrated: 0, skipped: 0, failed: 0 }

  for (const [directoryName, profile] of Object.entries(DIRECTORY_PROFILES)) {
    await migrateDirectory(sharp, uploadsRoot, directoryName, profile, stats)
  }

  console.log(`[migrate] 完成：新迁移 ${stats.migrated}，已存在跳过 ${stats.skipped}，失败 ${stats.failed}`)
}

main().catch((error) => {
  console.error('[migrate] 迁移中断：', error)
  process.exit(1)
})
