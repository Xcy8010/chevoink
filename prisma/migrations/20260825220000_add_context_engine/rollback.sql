DROP TABLE IF EXISTS "context_checkpoints";
DROP TABLE IF EXISTS "user_directives";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "task_spec";
DROP TYPE IF EXISTS "UserDirectiveStatus";
DROP TYPE IF EXISTS "UserDirectiveKind";
DROP TYPE IF EXISTS "UserDirectiveScope";
-- PostgreSQL 枚举值无法无损删除；AgentArtifactType 新值保留不影响旧版本。
