ALTER TABLE "agent_subtasks"
  ADD COLUMN "name" VARCHAR(160) NOT NULL DEFAULT '未命名子 Agent',
  ADD COLUMN "trigger_condition" TEXT NOT NULL DEFAULT '由主 Agent 或其他子 Agent 在任务匹配时调用',
  ADD COLUMN "callable_by" VARCHAR(32) NOT NULL DEFAULT 'main_and_subagents';
