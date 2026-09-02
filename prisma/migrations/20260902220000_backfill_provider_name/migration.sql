-- 回填历史用量的 provider_name：该列与 agent_run_id 同批新增，历史行未记录供应商，
-- 管理后台"模型用量"会整表显示"未知供应商"。按模型配置表可准确推断的行回填，
-- 推断不出的保持 NULL（前端继续显示"未知供应商"），避免错误归因。
-- 平台内置档位：档位 + 实际请求模型名匹配当前启用配置（模型名一致则供应商归属可靠）。
UPDATE "ai_usage_logs" AS usage
SET "provider_name" = matched."provider"
FROM (
  SELECT DISTINCT ON (tier, model_name) tier, model_name, provider
  FROM "ai_model_configs"
  WHERE owner_user_id IS NULL AND "enabled" = TRUE AND tier IS NOT NULL
  ORDER BY tier, model_name, updated_at DESC
) AS matched
WHERE usage."provider_name" IS NULL
  AND usage."model_tier" IS NOT NULL
  AND usage."model_tier" <> 'custom'
  AND usage."model_tier" = matched."tier"
  AND usage."model_name" = matched."model_name";

-- 自定义模型：用户 + 实际请求模型名匹配该用户启用的自定义配置；同名多网关取最近更新的一条。
UPDATE "ai_usage_logs" AS usage
SET "provider_name" = matched."provider"
FROM (
  SELECT DISTINCT ON (owner_user_id, model_name) owner_user_id, model_name, provider
  FROM "ai_model_configs"
  WHERE owner_user_id IS NOT NULL AND "enabled" = TRUE
  ORDER BY owner_user_id, model_name, updated_at DESC
) AS matched
WHERE usage."provider_name" IS NULL
  AND usage."model_tier" = 'custom'
  AND usage."user_id" = matched."owner_user_id"
  AND usage."model_name" = matched."model_name";
