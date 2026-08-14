import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

/**
 * GLM-4.1V 视觉推理旁路（ds-vision-skill 模式）：
 * 像素只发给视觉模型，换回文字描述交给 DeepSeek 主模型；主模型上下文永远不进 base64。
 * 进程内信号量控制免费档并发（默认 4，留 1 缓冲），排队超时/请求超时/重试均有上限。
 */

class VisionRetryableError extends Error {}

let inflight = 0
const waiters: Array<() => void> = []

function releaseSlot() {
  inflight -= 1
  const next = waiters.shift()
  if (next) {
    next()
  }
}

/** 获取并发槽位：排队超过 30s 视为视觉服务繁忙 */
function acquireSlot(): Promise<() => void> {
  if (inflight < env.aiVisionMaxConcurrent) {
    inflight += 1
    return Promise.resolve(releaseSlot)
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = waiters.indexOf(tryAcquire)
      if (index >= 0) {
        waiters.splice(index, 1)
      }
      reject(new DataAccessError(503, 'VISION_BUSY', '视觉服务繁忙（并发已满），请稍后再试。'))
    }, 30000)

    const tryAcquire = () => {
      clearTimeout(timer)
      inflight += 1
      resolve(releaseSlot)
    }

    waiters.push(tryAcquire)
  })
}

function isRetryable(error: unknown): boolean {
  return error instanceof VisionRetryableError
}

async function requestOnce(image: { buffer: Buffer; mime: string }, question: string): Promise<string> {
  // 一律 base64 内联：规避 localhost/内网图片对智谱不可达的问题
  const dataUrl = `data:${image.mime};base64,${image.buffer.toString('base64')}`

  const response = await fetch(`${env.aiVisionBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.aiVisionApiKey}`,
    },
    body: JSON.stringify({
      model: env.aiVisionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(env.aiVisionTimeoutMs),
  })

  if (response.status === 429 || response.status >= 500) {
    throw new VisionRetryableError(`视觉服务返回 ${response.status}`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new DataAccessError(
      502,
      'VISION_ERROR',
      `视觉服务请求失败（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`,
    )
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = payload.choices?.[0]?.message?.content
  const description = typeof content === 'string' ? content.trim() : ''

  if (!description) {
    throw new DataAccessError(502, 'VISION_ERROR', '视觉服务未返回描述内容。')
  }

  return description
}

/**
 * 把一张图片发给 GLM 视觉模型换回文字描述。
 * 未配置 key 时抛 503；429/5xx/超时退避 2s 重试 1 次；最终失败抛错由工具层转观察文本。
 */
export async function describeImageWithVision(
  image: { buffer: Buffer; mime: string },
  question: string,
): Promise<string> {
  if (!env.aiVisionApiKeyConfigured) {
    throw new DataAccessError(503, 'VISION_NOT_CONFIGURED', '视觉服务未配置（缺少 AI_VISION_API_KEY）。')
  }

  const release = await acquireSlot()

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await requestOnce(image, question)
      } catch (error) {
        if (!isRetryable(error) || attempt >= 1) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  } finally {
    release()
  }
}
