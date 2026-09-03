-- 轻量档（lite）：新增用户可选内置免费档（0.0x），模型 GLM-4.7-Flash；
-- 思考强度按智谱 flash 系列三档 low / high / max 登记（与极速档滑杆一致），默认 high；
-- 初始为停用占位（enabled/selectable 均 false），管理员在模型管理页完成服务商地址与密钥配置后启用并对用户开放。
INSERT INTO "ai_model_configs"
  ("id", "key", "provider", "display_name", "model_name", "base_url", "tier", "multiplier_bps", "enabled", "selectable", "is_default", "metadata", "created_at", "updated_at")
VALUES
  ('builtin-lite', 'builtin:lite', 'unconfigured', '轻量', 'GLM-4.7-Flash', NULL, 'lite', 0, false, false, false, '{"reasoningEfforts":["low","high","max"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
