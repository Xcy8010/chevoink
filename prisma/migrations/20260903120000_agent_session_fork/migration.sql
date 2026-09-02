-- 任务分支溯源字段：分支是源任务的完整副本，只记录来源 id 不建外键，
-- 源任务删除后分支仍可独立使用。forked_at 用于区分「复制来的对话」与「分支内新增对话」。
ALTER TABLE "agent_sessions" ADD COLUMN "forked_from_session_id" VARCHAR(64);
ALTER TABLE "agent_sessions" ADD COLUMN "forked_from_message_id" VARCHAR(64);
ALTER TABLE "agent_sessions" ADD COLUMN "forked_at" TIMESTAMP(3);

CREATE INDEX "agent_sessions_forked_from_session_id_idx" ON "agent_sessions"("forked_from_session_id");
