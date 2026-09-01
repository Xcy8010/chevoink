-- 基础模型档（basic）：承载后台轻量文本任务（关系网生成、一键导出建议等），
-- 与用户侧四档体验档位解耦，管理员可在模型管理页独立配置模型与 Credits 倍率；
-- 未配置/未启用时服务端自动回退极速档，业务不受影响，因此初始为停用占位。
INSERT INTO "ai_model_configs"
  ("id", "key", "provider", "display_name", "model_name", "base_url", "tier", "multiplier_bps", "enabled", "selectable", "is_default", "metadata", "created_at", "updated_at")
VALUES
  ('builtin-basic', 'builtin:basic', 'unconfigured', '基础模型', 'unconfigured', NULL, 'basic', 10000, false, false, false, '{"reasoningEfforts":["low","high","max"],"defaultReasoningEffort":"low","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
