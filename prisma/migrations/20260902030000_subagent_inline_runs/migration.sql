-- 子 Agent 内嵌化：agent_subtasks 退化为「定义层」+ enabled 开关，调用记录入新表 agent_subtask_runs
ALTER TABLE "agent_subtasks"
  ALTER COLUMN "parent_session_id" DROP NOT NULL,
  ALTER COLUMN "child_session_id" DROP NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'ready',
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- 旧数据兼容：已取消的定义视为停用
UPDATE "agent_subtasks" SET "enabled" = false WHERE "status" = 'cancelled';

-- 会话删除时不再级联删除子 Agent 定义，改为置空保留定义
ALTER TABLE "agent_subtasks" DROP CONSTRAINT "agent_subtasks_parent_session_id_fkey";
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_subtasks" DROP CONSTRAINT "agent_subtasks_child_session_id_fkey";
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_child_session_id_fkey" FOREIGN KEY ("child_session_id") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agent_subtask_runs" (
  "id" VARCHAR(64) PRIMARY KEY,
  "subtask_id" VARCHAR(64) NOT NULL,
  "parent_run_id" VARCHAR(64),
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "chapter_id" VARCHAR(64),
  "task" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'running',
  "result_summary" TEXT,
  "steps" JSONB,
  "usage" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "agent_subtask_runs_subtask_id_created_at_idx" ON "agent_subtask_runs"("subtask_id", "created_at");
CREATE INDEX "agent_subtask_runs_user_id_status_idx" ON "agent_subtask_runs"("user_id", "status");

ALTER TABLE "agent_subtask_runs" ADD CONSTRAINT "agent_subtask_runs_subtask_id_fkey" FOREIGN KEY ("subtask_id") REFERENCES "agent_subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtask_runs" ADD CONSTRAINT "agent_subtask_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_subtask_runs" ADD CONSTRAINT "agent_subtask_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtask_runs" ADD CONSTRAINT "agent_subtask_runs_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
