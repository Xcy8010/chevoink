-- 缓存观测补强：记录真实供应商与父 Agent Run 归属，支持 GLM/DeepSeek 分组和子 Agent 成本归并。
ALTER TABLE "ai_usage_logs"
  ADD COLUMN "provider_name" VARCHAR(40),
  ADD COLUMN "agent_run_id" VARCHAR(64);

-- 回填阶段一已经产生的主 Agent 与子 Agent 用量，避免部署窗口内的统计断层。
UPDATE "ai_usage_logs"
SET "agent_run_id" = "target_id"
WHERE "target_type" = 'agentRun' AND "target_id" IS NOT NULL;

UPDATE "ai_usage_logs" AS usage
SET "agent_run_id" = subtask."parent_run_id"
FROM "agent_subtask_runs" AS subtask
WHERE usage."target_type" = 'agentSubtaskRun'
  AND usage."target_id" = subtask."id"
  AND subtask."parent_run_id" IS NOT NULL;

CREATE INDEX "ai_usage_logs_agent_run_id_created_at_idx"
  ON "ai_usage_logs"("agent_run_id", "created_at");

CREATE INDEX "ai_usage_logs_created_at_idx"
  ON "ai_usage_logs"("created_at");

CREATE INDEX "ai_usage_logs_provider_name_model_name_created_at_idx"
  ON "ai_usage_logs"("provider_name", "model_name", "created_at");
