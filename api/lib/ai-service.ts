import { prisma, DataAccessError } from './prisma.js'
import { env } from '../config/env.js'
import type {
  ChapterAssistRequest,
  GenerateCoverImageRequest,
  GenerateCoverPromptRequest,
  GenerateOutlineRequest,
} from '../../shared/contracts/index.js'
import { createCoverAssetsData } from './data-access.js'

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

async function parseJsonResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text) as Record<string, any>
  } catch {
    throw new DataAccessError(502, 'AI_PROVIDER_INVALID_RESPONSE', '模型返回了无法解析的内容。')
  }
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
  const response = await fetch(env.aiImageBaseUrl, {
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
  })

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new DataAccessError(
      502,
      'AI_PROVIDER_ERROR',
      typeof payload.error?.message === 'string' ? payload.error.message : '图片模型服务暂时不可用。',
    )
  }

  const images = Array.isArray(payload.data) ? payload.data : []
  const imageUrls = images
    .map((item: any) => {
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
