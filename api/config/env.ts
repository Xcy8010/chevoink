import dotenv from 'dotenv'

dotenv.config({ override: true })

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
  aiTextModel: process.env.AI_TEXT_MODEL ?? 'deepseek-v4-pro',
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
  // Agent Loop 引擎：loop = 新内核；legacy = 旧链路；Vercel serverless 不支持长循环，强制 legacy
  agentEngine: process.env.VERCEL ? 'legacy' : (process.env.AGENT_ENGINE ?? 'loop'),
  agentModel: process.env.AI_AGENT_MODEL ?? process.env.AI_TEXT_MODEL ?? 'deepseek-chat',
  // 长任务（如连写六章）需要更多轮次与 token 预算，配合待办机制保证连续执行不早停
  agentMaxTurns: parsePositiveNumber(process.env.AGENT_MAX_TURNS, 40),
  agentRunTokenBudget: parsePositiveNumber(process.env.AGENT_RUN_TOKEN_BUDGET, 600000),
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
  // 听书 TTS（方案 17）：edge = 免费 Edge 神经音色；disabled = 全端隐藏听书入口
  ttsProvider: process.env.TTS_PROVIDER ?? 'edge',
  ttsDefaultVoice: process.env.TTS_DEFAULT_VOICE ?? 'zh-CN-XiaoxiaoNeural',
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
