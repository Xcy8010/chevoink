import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici'

import { prisma, DataAccessError } from './prisma.js'
import { env } from '../config/env.js'
import type {
  ChapterAssistRequest,
  GenerateCoverImageRequest,
  GenerateCoverPromptRequest,
  GenerateOutlineRequest,
} from '../../shared/contracts/index.js'
import { createCoverAssetsData } from './data-access.js'
import {
  FANQIE_ALL_CATEGORIES,
  FANQIE_PLOT_TAGS,
  FANQIE_ROLE_TAGS,
  FANQIE_THEME_TAGS,
  sanitizePublishAdvice,
  type PublishAdvice,
} from '../../shared/contracts/index.js'

type TextCompletionOptions = {
  userId: string
  action: string
  novelId?: string | null
  chapterId?: string | null
  targetType?: string
  targetId?: string | null
  temperature?: number
}

function ensureTextProviderConfigured() {
  if (!env.aiTextApiKeyConfigured || !env.aiTextApiKey) {
    throw new DataAccessError(503, 'AI_TEXT_PROVIDER_UNAVAILABLE', '文本模型尚未配置。')
  }
}

function ensureImageProviderConfigured() {
  if (!env.aiImageApiKeyConfigured || !env.aiImageApiKey) {
    throw new DataAccessError(503, 'AI_IMAGE_PROVIDER_UNAVAILABLE', '图片模型尚未配置。')
  }
}

/** 生图专用连接池：头/体超时都放宽到 aiImageTimeoutMs，避免慢响应被默认 5 分钟限制中断 */
const imageFetchAgent = new UndiciAgent({
  headersTimeout: env.aiImageTimeoutMs,
  bodyTimeout: env.aiImageTimeoutMs,
})

async function recordUsage(input: {
  userId: string
  providerType: 'text' | 'image'
  action: string
  modelName: string
  novelId?: string | null
  chapterId?: string | null
  targetType?: string
  targetId?: string | null
  requestTokens?: number | null
  responseTokens?: number | null
  durationMs: number
}) {
  await prisma.aiUsageLog.create({
    data: {
      userId: input.userId,
      novelId: input.novelId ?? null,
      chapterId: input.chapterId ?? null,
      coverAssetId: null,
      targetType: input.targetType ?? input.providerType,
      targetId: input.targetId ?? null,
      providerType: input.providerType,
      providerMode: env.aiProviderMode,
      modelName: input.modelName,
      action: input.action,
      requestTokens: input.requestTokens ?? null,
      responseTokens: input.responseTokens ?? null,
      durationMs: input.durationMs,
    },
  })
}

type JsonProviderPayload = {
  error?: { message?: unknown }
  data?: unknown
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

async function parseJsonResponse(response: Response): Promise<JsonProviderPayload> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as JsonProviderPayload
  } catch {
    throw new DataAccessError(502, 'AI_PROVIDER_INVALID_RESPONSE', '模型返回了无法解析的内容。')
  }
}

// ---------------------------------------------------------------------------
// 原生工具调用通道（Agent Loop 专用，OpenAI 兼容 tools + stream）
// ---------------------------------------------------------------------------

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; reasoning?: string; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; toolCallId: string; content: string }

export type ToolCallRequest = {
  id: string
  name: string
  arguments: string
}

export type OpenAIToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ChatTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type ChatStreamChunk =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call-start'; id: string; name: string }
  | { type: 'tool-call-arguments-delta'; id: string; delta: string }

export type ChatCompletionResult = {
  content: string
  reasoning: string
  toolCalls: ToolCallRequest[]
  finishReason: 'stop' | 'tool_calls' | 'length'
  usage: ChatTokenUsage
}

type ChatWithToolsParams = {
  messages: ChatMessage[]
  tools: OpenAIToolDefinition[]
  model?: string
  temperature?: number
  onChunk?: (chunk: ChatStreamChunk) => void
  signal?: AbortSignal
  usageLog: {
    userId: string
    action: string
    novelId?: string | null
    chapterId?: string | null
    targetType?: string
    targetId?: string | null
  }
}

function toProviderMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
    }

    if (message.role === 'assistant') {
      const payload: Record<string, unknown> = {
        role: 'assistant',
        content: message.content ?? '',
      }

      if (message.toolCalls?.length) {
        payload.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        }))
      }

      return payload
    }

    return { role: message.role, content: message.content }
  })
}

/**
 * 多轮 Agent Loop 的底层通道：流式解析 text / reasoning_content / tool_calls 增量，
 * 支持 AbortSignal 真实中断上游请求，每次调用都落 AiUsageLog。
 */
export async function chatWithTools(params: ChatWithToolsParams): Promise<ChatCompletionResult> {
  ensureTextProviderConfigured()

  const startedAt = Date.now()
  const model = params.model ?? env.aiTextModel
  const endpoint = `${env.aiTextBaseUrl.replace(/\/$/, '')}/chat/completions`

  const body: Record<string, unknown> = {
    model,
    temperature: params.temperature ?? 0.6,
    // 思考强度：默认 high 兼顾周到与成本（low 考虑不周、max 过度思考），env 可调整
    reasoning_effort: env.aiReasoningEffort,
    // 显式拉满单轮输出上限：不传时 DeepSeek 默认仅 4096，
    // Agent 写 3000+ 字长章时工具参数 JSON 会被 length 截断导致写入失败
    max_tokens: env.aiTextMaxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
    messages: toProviderMessages(params.messages),
  }

  if (params.tools.length > 0) {
    body.tools = params.tools
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.aiTextApiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok || !response.body) {
    const payload = await parseJsonResponse(response)
    throw new DataAccessError(
      502,
      'AI_PROVIDER_ERROR',
      typeof payload.error?.message === 'string' ? payload.error.message : '模型服务暂时不可用。',
    )
  }

  let content = ''
  let reasoning = ''
  let finishReason: ChatCompletionResult['finishReason'] = 'stop'
  const usage: ChatTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>()

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  const handleDelta = (parsed: {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    choices?: Array<{
      finish_reason?: unknown
      delta?: {
        reasoning_content?: unknown
        content?: unknown
        tool_calls?: Array<{ index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } }>
      }
    }>
  }) => {
    if (parsed.usage) {
      usage.promptTokens = parsed.usage.prompt_tokens ?? usage.promptTokens
      usage.completionTokens = parsed.usage.completion_tokens ?? usage.completionTokens
      usage.totalTokens = parsed.usage.total_tokens ?? usage.totalTokens
    }

    const choice = parsed.choices?.[0]
    if (!choice) {
      return
    }

    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'length' || choice.finish_reason === 'stop') {
      finishReason = choice.finish_reason
    }

    const delta = choice.delta ?? ({} as NonNullable<NonNullable<Parameters<typeof handleDelta>[0]['choices']>[number]['delta']>)

    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      reasoning += delta.reasoning_content
      params.onChunk?.({ type: 'reasoning-delta', delta: delta.reasoning_content })
    }

    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      params.onChunk?.({ type: 'text-delta', delta: delta.content })
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const item of delta.tool_calls) {
        const index = typeof item.index === 'number' ? item.index : 0
        let entry = toolCallsByIndex.get(index)

        if (!entry) {
          entry = { id: '', name: '', arguments: '' }
          toolCallsByIndex.set(index, entry)
        }

        if (typeof item.id === 'string' && item.id) {
          entry.id = item.id
        }

        if (typeof item.function?.name === 'string' && item.function.name) {
          entry.name += item.function.name
          params.onChunk?.({ type: 'tool-call-start', id: entry.id, name: entry.name })
        }

        if (typeof item.function?.arguments === 'string' && item.function.arguments) {
          entry.arguments += item.function.arguments
          params.onChunk?.({ type: 'tool-call-arguments-delta', id: entry.id, delta: item.function.arguments })
        }
      }
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }

          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') {
            continue
          }

          try {
            handleDelta(JSON.parse(data))
          } catch {
            // 单帧解析失败不中断流
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const toolCalls: ToolCallRequest[] = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry], index) => ({
      id: entry.id || `call_${index}`,
      name: entry.name,
      arguments: entry.arguments || '{}',
    }))
    .filter((call) => call.name)

  if (toolCalls.length > 0) {
    finishReason = 'tool_calls'
  }

  await recordUsage({
    userId: params.usageLog.userId,
    providerType: 'text',
    action: params.usageLog.action,
    modelName: model,
    novelId: params.usageLog.novelId ?? null,
    chapterId: params.usageLog.chapterId ?? null,
    targetType: params.usageLog.targetType ?? 'agentRun',
    targetId: params.usageLog.targetId ?? null,
    requestTokens: usage.promptTokens || null,
    responseTokens: usage.completionTokens || null,
    durationMs: Date.now() - startedAt,
  })

  return { content, reasoning, toolCalls, finishReason, usage }
}

export async function generateTextCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: TextCompletionOptions,
) {
  ensureTextProviderConfigured()

  const startedAt = Date.now()
  const endpoint = `${env.aiTextBaseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.aiTextApiKey}`,
    },
    body: JSON.stringify({
      model: env.aiTextModel,
      temperature: options.temperature ?? 0.7,
      reasoning_effort: env.aiReasoningEffort,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  const payload = await parseJsonResponse(response)

  if (!response.ok) {
    throw new DataAccessError(
      502,
      'AI_PROVIDER_ERROR',
      typeof payload.error?.message === 'string' ? payload.error.message : '模型服务暂时不可用。',
    )
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new DataAccessError(502, 'AI_PROVIDER_EMPTY_RESPONSE', '模型未返回有效内容。')
  }

  await recordUsage({
    userId: options.userId,
    providerType: 'text',
    action: options.action,
    modelName: env.aiTextModel,
    novelId: options.novelId ?? null,
    chapterId: options.chapterId ?? null,
    targetType: options.targetType ?? 'text',
    targetId: options.targetId ?? null,
    requestTokens: payload.usage?.prompt_tokens ?? null,
    responseTokens: payload.usage?.completion_tokens ?? null,
    durationMs: Date.now() - startedAt,
  })

  return content.trim()
}

async function generateImageUrls(
  prompt: string,
  size: string,
  count: number,
  userId: string,
  action: string,
) {
  ensureImageProviderConfigured()

  const startedAt = Date.now()
  // Node 内置 fetch 默认 5 分钟头超时，第三方生图服务经常超过，这里用 undici 显式放宽到 aiImageTimeoutMs
  const response = await undiciFetch(env.aiImageBaseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.aiImageApiKey}`,
    },
    body: JSON.stringify({
      model: env.aiImageModel,
      prompt,
      size,
      n: count,
    }),
    dispatcher: imageFetchAgent,
  })

  const payload = await parseJsonResponse(response as unknown as Response)
  if (!response.ok) {
    throw new DataAccessError(
      502,
      'AI_PROVIDER_ERROR',
      typeof payload.error?.message === 'string' ? payload.error.message : '图片模型服务暂时不可用。',
    )
  }

  const images = Array.isArray(payload.data) ? payload.data : []
  const imageUrls = images
    .map((item: { url?: unknown; b64_json?: unknown }) => {
      if (typeof item?.url === 'string') {
        return item.url
      }

      if (typeof item?.b64_json === 'string') {
        return `data:image/png;base64,${item.b64_json}`
      }

      return null
    })
    .filter((item: string | null): item is string => Boolean(item))

  if (imageUrls.length === 0) {
    throw new DataAccessError(502, 'AI_PROVIDER_EMPTY_RESPONSE', '图片模型未返回有效图片。')
  }

  await recordUsage({
    userId,
    providerType: 'image',
    action,
    modelName: env.aiImageModel,
    targetType: 'coverAsset',
    durationMs: Date.now() - startedAt,
  })

  return imageUrls
}

export async function getAiConfigPayload() {
  return {
    textModel: env.aiTextModel,
    imageModel: env.aiImageModel,
    providerMode: env.aiProviderMode,
    contextWindow: {
      maxTokens: env.aiTextContextMaxTokens,
      softLimit: env.aiTextContextSoftLimit,
      compressLevel1: env.aiTextContextCompressLevel1,
      compressLevel2: env.aiTextContextCompressLevel2,
    },
  }
}

export async function generateOutlineData(userId: string, input: GenerateOutlineRequest) {
  const systemPrompt = '你是一名小说策划编辑，请输出清晰、可执行的中文章节大纲。'
  const userPrompt = [
    `主题：${input.theme}`,
    `题材：${input.genre}`,
    `语气：${input.tone ?? '克制、专业'}`,
    `篇幅目标：${input.targetLength ?? 'medium'}`,
    '请输出分点大纲，并包含故事主线、冲突推进和结尾钩子。',
  ].join('\n')

  const outline = await generateTextCompletion(systemPrompt, userPrompt, {
    userId,
    action: 'generateOutline',
    targetType: 'outline',
  })

  return {
    outline,
    providerMode: env.aiProviderMode,
  }
}

export async function chapterAssistData(userId: string, input: ChapterAssistRequest) {
  const modeLabels = {
    continue: '续写',
    rewrite: '改写',
    polish: '润色',
    summarize: '总结',
  } as const

  const systemPrompt = `你是一名专业小说编辑，请围绕“${modeLabels[input.mode]}”任务输出中文结果。`
  const userPrompt = [
    `任务类型：${modeLabels[input.mode]}`,
    input.novelId ? `作品ID：${input.novelId}` : '',
    input.chapterId ? `章节ID：${input.chapterId}` : '',
    '原文：',
    input.content,
  ]
    .filter(Boolean)
    .join('\n')

  const result = await generateTextCompletion(systemPrompt, userPrompt, {
    userId,
    action: 'chapterAssist',
    novelId: input.novelId ?? null,
    chapterId: input.chapterId ?? null,
    targetType: 'chapter',
    targetId: input.chapterId ?? input.novelId ?? null,
  })

  return {
    result,
    summary: input.mode === 'summarize' ? result : undefined,
    providerMode: env.aiProviderMode,
  }
}

export async function generateCoverPromptData(userId: string, input: GenerateCoverPromptRequest) {
  const systemPrompt = '你是一名小说封面提示词设计师，请输出适合图像模型的中文封面提示词。'
  const userPrompt = [
    `作品名：${input.novelTitle}`,
    `简介：${input.summary}`,
    `题材：${input.genre}`,
    input.protagonist ? `主角：${input.protagonist}` : '',
    input.stylePreference ? `风格：${input.stylePreference}` : '',
    '画面必须适配竖版书籍封面构图，保持稳定的 3:4 书封比例。',
    '请输出一段主提示词，并附带 4 到 8 个视觉关键词。',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = await generateTextCompletion(systemPrompt, userPrompt, {
    userId,
    action: 'generateCoverPrompt',
    targetType: 'coverPrompt',
  })

  const visualKeywords = prompt
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)

  return {
    prompt,
    visualKeywords,
    providerMode: env.aiProviderMode,
  }
}

export async function generateCoverImageData(
  userId: string,
  input: GenerateCoverImageRequest & { novelId?: string | null; negativePrompt?: string | null },
) {
  const imageUrls = await generateImageUrls(input.prompt, input.size, input.count, userId, 'generateCoverImage')
  const images = await createCoverAssetsData({
    userId,
    prompt: input.prompt,
    count: input.count,
    imageUrls,
    modelName: env.aiImageModel,
    novelId: input.novelId ?? null,
    negativePrompt: input.negativePrompt ?? null,
  })

  return {
    images,
    providerMode: env.aiProviderMode,
  }
}

/** 从模型回复里抠出 JSON 对象（兼容 ```json 包裹与前后杂音） */
function extractJsonObject(content: string): unknown {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')

  if (start === -1 || end <= start) {
    throw new DataAccessError(502, 'AI_PROVIDER_INVALID_RESPONSE', '模型未返回可解析的 JSON。')
  }

  try {
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    throw new DataAccessError(502, 'AI_PROVIDER_INVALID_RESPONSE', '模型返回了无法解析的 JSON。')
  }
}

/**
 * 番茄小说发布建议：男频/女频、主分类（单选）、主题/角色/情节标签（各≤2）与主角名（≤2）。
 * 模型输出经 sanitizePublishAdvice 钳制到番茄词表，非法标签一律丢弃。
 */
export async function generatePublishAdviceData(
  userId: string,
  input: {
    novelId?: string | null
    title: string
    summary: string
    genre: string
    tags: string[]
    sampleText: string
  },
): Promise<PublishAdvice> {
  const systemPrompt = [
    '你是番茄小说的资深责编，熟悉番茄作者端的作品标签体系。',
    '请根据作品信息快速判断其在番茄发布的标签配置，只输出一个 JSON 对象，不要输出其它内容。',
    'JSON 字段：channel（"男频"或"女频"）、mainCategory（主分类，只能从给定主分类清单选一个）、themeTags（主题，最多2个，只能从主题清单选）、roleTags（角色，最多2个，只能从角色清单选）、plotTags（情节，最多2个，只能从情节清单选）、protagonists（主角名字，最多2个）、advice（50-150字发布建议，含开篇节奏与卖点）。',
    '严禁使用清单之外的标签。',
  ].join('\n')

  const userPrompt = [
    `作品名：${input.title}`,
    `简介：${input.summary}`,
    `题材：${input.genre}`,
    `已有标签：${input.tags.join('、') || '无'}`,
    `正文样章：${input.sampleText.slice(0, 1500) || '无'}`,
    `主分类清单：${FANQIE_ALL_CATEGORIES.join('、')}`,
    `主题清单：${FANQIE_THEME_TAGS.join('、')}`,
    `角色清单：${FANQIE_ROLE_TAGS.join('、')}`,
    `情节清单：${FANQIE_PLOT_TAGS.join('、')}`,
  ].join('\n')

  const content = await generateTextCompletion(systemPrompt, userPrompt, {
    userId,
    action: 'generatePublishAdvice',
    novelId: input.novelId ?? null,
    targetType: 'publishAdvice',
    temperature: 0.3,
  })

  return sanitizePublishAdvice(extractJsonObject(content))
}
