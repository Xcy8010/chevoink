-- AlterEnum: AgentRunStatus 增加 awaiting_approval / paused
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'paused';

-- AlterEnum: AgentActionKind 增加 workspaceAgent（统一循环入口动作）
ALTER TYPE "AgentActionKind" ADD VALUE IF NOT EXISTS 'workspaceAgent';

-- AlterTable: agent_runs 新增引擎标记 / 轮次 / 用量
ALTER TABLE "agent_runs" ADD COLUMN "engine" VARCHAR(16) NOT NULL DEFAULT 'legacy';
ALTER TABLE "agent_runs" ADD COLUMN "current_turn" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agent_runs" ADD COLUMN "usage" JSONB;

-- CreateTable: agent_messages（Agent Loop 的消息级持久化）
CREATE TABLE "agent_messages" (
    "id" VARCHAR(64) NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "parts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_run_events（真实事件流，replay/重连数据源）
CREATE TABLE "agent_run_events" (
    "id" VARCHAR(64) NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent_messages"("session_id", "created_at");
CREATE INDEX "agent_messages_run_id_created_at_idx" ON "agent_messages"("run_id", "created_at");
CREATE UNIQUE INDEX "agent_run_events_run_id_seq_key" ON "agent_run_events"("run_id", "seq");

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
