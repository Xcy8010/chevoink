-- Agent 缓存命中观测：记录每轮请求的缓存命中/未命中输入 token 与 Agent 轮号（均可空，纯增量）
ALTER TABLE "ai_usage_logs"
  ADD COLUMN "turn" INTEGER,
  ADD COLUMN "prompt_cache_hit_tokens" INTEGER,
  ADD COLUMN "prompt_cache_miss_tokens" INTEGER;
