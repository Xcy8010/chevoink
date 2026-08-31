INSERT INTO "ai_model_configs"
  ("id", "key", "provider", "display_name", "model_name", "base_url", "tier", "multiplier_bps", "enabled", "selectable", "is_default", "metadata", "created_at", "updated_at")
VALUES
  ('tool-image-generation', 'tool:image-generation', 'unconfigured', '图片生成', 'unconfigured', NULL, 'tool_image', 60000, false, false, false, '{"modelKind":"image_generation","reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tool-image-vision', 'tool:image-vision', 'unconfigured', '图片理解', 'unconfigured', NULL, 'tool_vision', 10000, false, false, false, '{"modelKind":"vision","reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tool-web-search', 'tool:web-search', 'unconfigured', '联网搜索', 'unconfigured', NULL, 'tool_search', 20000, false, false, false, '{"modelKind":"web_search","reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
