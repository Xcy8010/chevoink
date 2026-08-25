ALTER TYPE "AgentArtifactType" ADD VALUE IF NOT EXISTS 'searchResult';
ALTER TYPE "AgentArtifactType" ADD VALUE IF NOT EXISTS 'contextCheckpoint';

CREATE TYPE "UserDirectiveScope" AS ENUM ('global', 'volume', 'chapter', 'task');
CREATE TYPE "UserDirectiveKind" AS ENUM ('goal', 'must', 'must_not', 'preference', 'decision');
CREATE TYPE "UserDirectiveStatus" AS ENUM ('active', 'fulfilled', 'superseded', 'cancelled');

ALTER TABLE "agent_runs" ADD COLUMN "task_spec" JSONB;

CREATE TABLE "user_directives" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "session_id" VARCHAR(64),
  "volume_id" VARCHAR(64),
  "chapter_id" VARCHAR(64),
  "task_spec_id" VARCHAR(64),
  "scope" "UserDirectiveScope" NOT NULL,
  "kind" "UserDirectiveKind" NOT NULL,
  "text" TEXT NOT NULL,
  "status" "UserDirectiveStatus" NOT NULL DEFAULT 'active',
  "source_message_id" VARCHAR(64) NOT NULL,
  "superseded_by" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_directives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "context_checkpoints" (
  "id" VARCHAR(64) NOT NULL,
  "session_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64),
  "source_message_count" INTEGER NOT NULL,
  "source_message_ids" JSONB NOT NULL,
  "source_started_at" TIMESTAMP(3) NOT NULL,
  "source_ended_at" TIMESTAMP(3) NOT NULL,
  "source_tokens" INTEGER NOT NULL,
  "summary_tokens" INTEGER NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source_hash" VARCHAR(64) NOT NULL,
  "summary" JSONB NOT NULL,
  "validation" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "context_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_directives_novel_id_status_created_at_idx" ON "user_directives"("novel_id", "status", "created_at");
CREATE INDEX "user_directives_session_id_status_idx" ON "user_directives"("session_id", "status");
CREATE INDEX "user_directives_source_message_id_idx" ON "user_directives"("source_message_id");
CREATE INDEX "context_checkpoints_session_id_created_at_idx" ON "context_checkpoints"("session_id", "created_at");

ALTER TABLE "user_directives" ADD CONSTRAINT "user_directives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_directives" ADD CONSTRAINT "user_directives_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_directives" ADD CONSTRAINT "user_directives_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_checkpoints" ADD CONSTRAINT "context_checkpoints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_checkpoints" ADD CONSTRAINT "context_checkpoints_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
