import dotenv from 'dotenv'

// DOTENV_PATH：测试等场景指向独立 env 文件，
// 避免测试进程以 override:true 误读开发 .env（覆盖注入变量/误连开发库）
dotenv.config({ path: process.env.DOTENV_PATH ?? '.env', override: true })

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  return value === 'true'
}

function isConfigured(value: string | undefined): boolean {
  return Boolean(value && value !== 'replace_me')
}

function parseReasoningEffort(value: string | undefined): 'low' | 'high' | 'max' {
  return value === 'high' || value === 'max' ? value : 'low'
}

export const env = {
  appName: process.env.APP_NAME ?? '启创墨域',
  appEnv: process.env.APP_ENV ?? 'development',
  port: parsePositiveNumber(process.env.APP_PORT, 3001),
  webUrl: process.env.APP_WEB_URL ?? 'http://localhost:5173',
  serverUrl: process.env.APP_SERVER_URL ?? 'http://localhost:3001',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  authAccessTokenExpiresIn: process.env.AUTH_ACCESS_TOKEN_EXPIRES_IN ?? '15m',
  authRefreshTokenExpiresIn: process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN ?? '30d',
  authSessionSecret: process.env.AUTH_SESSION_SECRET ?? '',
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN ?? '',
  authCookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, false),
  smsTencentSecretIdConfigured: isConfigured(process.env.SMS_TENCENT_SECRET_ID),
  smsTencentSecretId: process.env.SMS_TENCENT_SECRET_ID ?? '',
  smsTencentSecretKeyConfigured: isConfigured(process.env.SMS_TENCENT_SECRET_KEY),
  smsTencentSecretKey: process.env.SMS_TENCENT_SECRET_KEY ?? '',
  smsTencentRegion: process.env.SMS_TENCENT_REGION ?? 'ap-guangzhou',
  smsTencentSdkAppIdConfigured: isConfigured(process.env.SMS_TENCENT_SDK_APP_ID),
  smsTencentSdkAppId: process.env.SMS_TENCENT_SDK_APP_ID ?? '',
  smsTencentSignNameConfigured: isConfigured(process.env.SMS_TENCENT_SIGN_NAME),
  smsTencentSignName: process.env.SMS_TENCENT_SIGN_NAME ?? '',
  smsTencentTemplateIdAuthConfigured: isConfigured(process.env.SMS_TENCENT_TEMPLATE_ID_AUTH),
  smsTencentTemplateIdAuth: process.env.SMS_TENCENT_TEMPLATE_ID_AUTH ?? '',
  smsCodeLength: parsePositiveNumber(process.env.SMS_CODE_LENGTH, 6),
  smsCodeExpiresInSeconds: parsePositiveNumber(process.env.SMS_CODE_EXPIRES_IN_SECONDS, 300),
  smsCodeCooldownSeconds: parsePositiveNumber(process.env.SMS_CODE_COOLDOWN_SECONDS, 60),
  smsCodeHourlyLimit: parsePositiveNumber(process.env.SMS_CODE_HOURLY_LIMIT, 5),
  aiTextProvider: process.env.AI_TEXT_PROVIDER ?? 'deepseek',
  aiTextBaseUrl: process.env.AI_TEXT_BASE_URL ?? 'https://api.deepseek.com',
  aiTextApiKeyConfigured: isConfigured(process.env.AI_TEXT_API_KEY),
  aiTextApiKey: process.env.AI_TEXT_API_KEY ?? '',
  aiTextModel: process.env.AI_TEXT_MODEL ?? 'deepseek-v4-flash',
  // 思考强度（DeepSeek 思考模式 reasoning_effort：low/high/max）：默认 high 思考冗长犹豫、浪费 token，
  // 默认 low 让思考简短果断；需要更深规划时经环境变量上调
  aiReasoningEffort: parseReasoningEffort(process.env.AI_REASONING_EFFORT),
  aiTextContextMaxTokens: parsePositiveNumber(process.env.AI_TEXT_CONTEXT_MAX_TOKENS, 1000000),
  aiTextContextSoftLimit: parsePositiveNumber(process.env.AI_TEXT_CONTEXT_SOFT_LIMIT, 700000),
  aiTextContextCompressLevel1: parsePositiveNumber(
    process.env.AI_TEXT_CONTEXT_COMPRESS_LEVEL1,
    850000,
  ),
  aiTextContextCompressLevel2: parsePositiveNumber(
    process.env.AI_TEXT_CONTEXT_COMPRESS_LEVEL2,
    950000,
  ),
  aiTextTimeoutMs: parsePositiveNumber(process.env.AI_TEXT_TIMEOUT_MS, 180000),
  // 单轮 LLM 调用的最大输出 token：不传时 DeepSeek 默认仅 4096，写长章节时工具参数会被截断；
  // deepseek-chat 输出上限 8192，默认拉满，换更强模型时可通过环境变量上调
  aiTextMaxOutputTokens: parsePositiveNumber(process.env.AI_TEXT_MAX_OUTPUT_TOKENS, 8192),
  // 视觉推理旁路（Agent view_image 工具）：DeepSeek 本体无视觉，图片统一发给 GLM 视觉模型换回文字描述（ds-vision-skill 模式）
  aiVisionBaseUrl: process.env.AI_VISION_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
  aiVisionApiKeyConfigured: isConfigured(process.env.AI_VISION_API_KEY),
  aiVisionApiKey: process.env.AI_VISION_API_KEY ?? '',
  aiVisionModel: process.env.AI_VISION_MODEL ?? 'glm-4.1v-thinking-flash',
  aiVisionTimeoutMs: parsePositiveNumber(process.env.AI_VISION_TIMEOUT_MS, 60000),
  // 免费档并发 5，进程内信号量留 1 缓冲
  aiVisionMaxConcurrent: parsePositiveNumber(process.env.AI_VISION_MAX_CONCURRENT, 4),
  // 全权限开关：'ask' 类工具动作自动批准；置 false 一键回退审批流
  agentAutoApprove: (process.env.AGENT_AUTO_APPROVE ?? 'true') !== 'false',
  agentModel: process.env.AI_AGENT_MODEL ?? process.env.AI_TEXT_MODEL ?? 'deepseek-chat',
  // 长任务（如连写六章）需要更多轮次与 token 预算，配合待办机制保证连续执行不早停；
  // 对齐主流 Agent 单任务消耗量级（百轮/百万 token），配合循环内的上下文瘦身机制防爆窗
  agentMaxTurns: parsePositiveNumber(process.env.AGENT_MAX_TURNS, 100),
  agentRunTokenBudget: parsePositiveNumber(process.env.AGENT_RUN_TOKEN_BUDGET, 2000000),
  agentApprovalTimeoutMs: parsePositiveNumber(process.env.AGENT_APPROVAL_TIMEOUT_MS, 600000),
  agentUserMaxConcurrent: parsePositiveNumber(process.env.AGENT_USER_MAX_CONCURRENT, 2),
  aiImageProvider: process.env.AI_IMAGE_PROVIDER ?? 'openai-compatible',
  aiImageBaseUrl:
    process.env.AI_IMAGE_BASE_URL ?? 'https://your-image-provider.example.com/v1/images/generations',
  aiImageApiKeyConfigured: isConfigured(process.env.AI_IMAGE_API_KEY),
  aiImageApiKey: process.env.AI_IMAGE_API_KEY ?? '',
  aiImageModel: process.env.AI_IMAGE_MODEL ?? 'gpt-image-2',
  aiImageDefaultSize: process.env.AI_IMAGE_DEFAULT_SIZE ?? '1024x1536',
  aiImageDefaultCount: parsePositiveNumber(process.env.AI_IMAGE_DEFAULT_COUNT, 1),
  // 联网搜索（Agent web_search 工具）：auto = 有博查 key 用博查、失败依次降搜狗/Bing 免 key 抓取；
  // disabled = 工具回填不可用
  webSearchProvider: process.env.WEB_SEARCH_PROVIDER ?? 'auto',
  webSearchBochaApiKeyConfigured: isConfigured(process.env.WEB_SEARCH_BOCHA_API_KEY),
  webSearchBochaApiKey: process.env.WEB_SEARCH_BOCHA_API_KEY ?? '',
  webSearchTimeoutMs: parsePositiveNumber(process.env.WEB_SEARCH_TIMEOUT_MS, 15000),
  // web_read 深读增强：readability 主线提取（false 一键回退正则提取）
  webReadUseReadability: (process.env.WEB_READ_USE_READABILITY ?? 'true') !== 'false',
  // 托管 Reader 爬虫兜底层：仅本地提取正文不足时触发；off | jina | firecrawl。
  // r.jina.ai 境内可达性有争议（jina-ai/reader issue #1237），启用前在 VPS 实测：curl https://r.jina.ai/https://example.com
  webReaderFallback: process.env.WEB_READER_FALLBACK ?? 'off',
  webReaderJinaApiKey: process.env.JINA_READER_API_KEY ?? '',
  webReaderFirecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  // 听书 TTS（方案 17）：edge = 免费 Edge 神经音色；disabled = 全端隐藏听书入口
  ttsProvider: process.env.TTS_PROVIDER ?? 'edge',
  ttsDefaultVoice: process.env.TTS_DEFAULT_VOICE ?? 'zh-CN-YunjianNeural',
  ttsCacheDir: process.env.TTS_CACHE_DIR ?? '',
  ttsCacheMaxMb: parsePositiveNumber(process.env.TTS_CACHE_MAX_MB, 2048),
  ttsTimeoutMs: parsePositiveNumber(process.env.TTS_TIMEOUT_MS, 30000),
  // 第三方生图服务响应很慢，默认放宽到 15 分钟（Node fetch 默认 5 分钟头超时不够用）
  aiImageTimeoutMs: parsePositiveNumber(process.env.AI_IMAGE_TIMEOUT_MS, 900000),
  aiProviderMode:
    isConfigured(process.env.AI_TEXT_API_KEY) && isConfigured(process.env.AI_IMAGE_API_KEY)
      ? 'provider'
      : 'fallback',
  smsProviderMode:
    isConfigured(process.env.SMS_TENCENT_SECRET_ID) &&
    isConfigured(process.env.SMS_TENCENT_SECRET_KEY) &&
    isConfigured(process.env.SMS_TENCENT_SDK_APP_ID) &&
    isConfigured(process.env.SMS_TENCENT_SIGN_NAME) &&
    isConfigured(process.env.SMS_TENCENT_TEMPLATE_ID_AUTH)
      ? 'provider'
      : 'disabled',
}
