import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

function encryptionKey(): Buffer {
  const source = env.modelConfigEncryptionKey || env.authSessionSecret
  if (!source) throw new DataAccessError(503, 'MODEL_SECRET_KEY_MISSING', '模型密钥加密主密钥尚未配置。')
  return createHash('sha256').update(source).digest()
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function decryptSecret(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
    throw new DataAccessError(500, 'MODEL_SECRET_INVALID', '模型密钥密文格式无效。')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new DataAccessError(500, 'MODEL_SECRET_DECRYPT_FAILED', '模型密钥解密失败，请在管理端重新替换。')
  }
}
