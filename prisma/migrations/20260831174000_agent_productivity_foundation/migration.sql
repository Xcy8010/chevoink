ALTER TABLE "agent_sessions"
  ADD COLUMN "pinned_at" TIMESTAMP(3),
  ADD COLUMN "tool_policy" JSONB,
  ADD COLUMN "sandbox_mode" VARCHAR(24) NOT NULL DEFAULT 'workspace';

CREATE TABLE "story_branches" (
  "id" VARCHAR(64) PRIMARY KEY,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "chapter_id" VARCHAR(64) NOT NULL,
  "source_run_id" VARCHAR(64),
  "name" VARCHAR(160) NOT NULL,
  "base_revision" INTEGER NOT NULL,
  "base_content" TEXT NOT NULL,
  "head_content" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "merged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "story_branches_user_id_novel_id_updated_at_idx" ON "story_branches"("user_id", "novel_id", "updated_at");
CREATE INDEX "story_branches_chapter_id_status_idx" ON "story_branches"("chapter_id", "status");

CREATE TABLE "agent_subtasks" (
  "id" VARCHAR(64) PRIMARY KEY,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "parent_session_id" VARCHAR(64) NOT NULL,
  "child_session_id" VARCHAR(64) NOT NULL,
  "child_run_id" VARCHAR(64),
  "role" VARCHAR(32) NOT NULL,
  "prompt" TEXT NOT NULL,
  "token_budget" INTEGER NOT NULL DEFAULT 4000,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "agent_subtasks_user_id_novel_id_created_at_idx" ON "agent_subtasks"("user_id", "novel_id", "created_at");
CREATE INDEX "agent_subtasks_parent_session_id_created_at_idx" ON "agent_subtasks"("parent_session_id", "created_at");

CREATE TABLE "agent_schedules" (
  "id" VARCHAR(64) PRIMARY KEY,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "session_id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "prompt" TEXT NOT NULL,
  "cadence_minutes" INTEGER NOT NULL,
  "next_run_at" TIMESTAMP(3) NOT NULL,
  "last_run_id" VARCHAR(64),
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "locked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "agent_schedules_status_next_run_at_idx" ON "agent_schedules"("status", "next_run_at");
CREATE INDEX "agent_schedules_user_id_novel_id_updated_at_idx" ON "agent_schedules"("user_id", "novel_id", "updated_at");

CREATE TABLE "agent_eval_comparisons" (
  "id" VARCHAR(64) PRIMARY KEY,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "run_ids" JSONB NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "agent_eval_comparisons_user_id_novel_id_created_at_idx" ON "agent_eval_comparisons"("user_id", "novel_id", "created_at");

ALTER TABLE "story_branches" ADD CONSTRAINT "story_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_branches" ADD CONSTRAINT "story_branches_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_branches" ADD CONSTRAINT "story_branches_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_branches" ADD CONSTRAINT "story_branches_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_child_session_id_fkey" FOREIGN KEY ("child_session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_subtasks" ADD CONSTRAINT "agent_subtasks_child_run_id_fkey" FOREIGN KEY ("child_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_last_run_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_eval_comparisons" ADD CONSTRAINT "agent_eval_comparisons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_eval_comparisons" ADD CONSTRAINT "agent_eval_comparisons_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
