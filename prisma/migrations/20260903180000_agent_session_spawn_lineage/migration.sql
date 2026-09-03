-- 跨任务编排派生溯源字段：派生窗口是独立会话（独立 run、独立并发额度），
-- 只记录来源 id 不建外键，源任务删除后派生窗口仍可独立使用。
-- spawned_from_session_id 非空是「禁用编排工具」的判据，防止派生窗口再派生。
ALTER TABLE "agent_sessions" ADD COLUMN "spawned_from_session_id" VARCHAR(64);
ALTER TABLE "agent_sessions" ADD COLUMN "spawned_from_run_id" VARCHAR(64);

CREATE INDEX "agent_sessions_spawned_from_session_id_idx" ON "agent_sessions"("spawned_from_session_id");
