import type { TtsSynthesizeRequest, TtsVoicesPayload } from '../../../../shared/contracts/index.js'
import { buildApiUrl } from '@/app/api-base'
import { requestJson } from '@/app/api-client'

/** 音色清单（服务端白名单），available=false 时前端隐藏听书入口 */
export function fetchTtsVoices(): Promise<TtsVoicesPayload> {
  return requestJson<TtsVoicesPayload>('/api/ai/tts/voices')
}

/**
 * 合成一批音频并返回 objectURL（audio/mpeg 二进制，不走 JSON 包装）。
 * 调用方负责在不再使用时 URL.revokeObjectURL。
 */
export async function fetchTtsBatchAudio(
  request: TtsSynthesizeRequest,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(buildApiUrl('/api/ai/tts/synthesize'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    let message = '语音合成暂时不可用，请稍后重试。'
    try {
      const payload = (await response.json()) as { error?: { message?: string } }
      if (payload.error?.message) message = payload.error.message
    } catch {
      // 非 JSON 错误体，保留默认文案
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}
