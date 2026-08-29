CREATE TYPE "StoryCompilerMode" AS ENUM ('balanced', 'premium');
CREATE TYPE "StoryCompilationStage" AS ENUM ('prepare', 'beat', 'write', 'check', 'repair', 'commit');
CREATE TYPE "StoryCompilationStatus" AS ENUM ('active', 'completed', 'abandoned', 'failed');
CREATE TYPE "SceneTaskStatus" AS ENUM ('ready', 'writing', 'completed', 'abandoned');
CREATE TYPE "ReaderPromiseStatus" AS ENUM ('open', 'paid', 'deferred', 'abandoned');

CREATE TABLE "story_charters" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "one_line_promise" TEXT NOT NULL,
  "target_audience" TEXT NOT NULL,
  "target_platform" VARCHAR(160) NOT NULL DEFAULT '',
  "protagonist_desire" TEXT NOT NULL,
  "protagonist_fear" TEXT NOT NULL,
  "protagonist_misbelief" TEXT NOT NULL,
  "protagonist_non_negotiable" TEXT NOT NULL,
  "conflict_engine" TEXT NOT NULL,
  "relationship_engine" TEXT NOT NULL,
  "genre_rules" JSONB NOT NULL,
  "ability_costs" JSONB NOT NULL,
  "reality_boundaries" JSONB NOT NULL,
  "emotional_baseline" TEXT NOT NULL,
  "emotional_range" TEXT NOT NULL,
  "style_dna" JSONB NOT NULL,
  "forbidden_zones" JSONB NOT NULL,
  "anti_examples" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_charters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reader_promises" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "promise" TEXT NOT NULL,
  "payoff_horizon" VARCHAR(160) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "status" "ReaderPromiseStatus" NOT NULL DEFAULT 'open',
  "paid_at_chapter" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reader_promises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_compilations" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64),
  "chapter_id" VARCHAR(64),
  "target_order_index" INTEGER NOT NULL,
  "mode" "StoryCompilerMode" NOT NULL DEFAULT 'balanced',
  "stage" "StoryCompilationStage" NOT NULL DEFAULT 'prepare',
  "status" "StoryCompilationStatus" NOT NULL DEFAULT 'active',
  "source_prompt_hash" VARCHAR(64) NOT NULL,
  "prepared_context" JSONB NOT NULL,
  "validation" JSONB,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_compilations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scene_tasks" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "compilation_id" VARCHAR(64) NOT NULL,
  "chapter_id" VARCHAR(64),
  "ordinal" INTEGER NOT NULL,
  "status" "SceneTaskStatus" NOT NULL DEFAULT 'ready',
  "purpose" TEXT NOT NULL,
  "entry_state" JSONB NOT NULL,
  "goal" TEXT NOT NULL,
  "obstacle" TEXT NOT NULL,
  "choice" TEXT NOT NULL,
  "cost" TEXT NOT NULL,
  "turn" TEXT NOT NULL,
  "exit_state" JSONB NOT NULL,
  "style_budget" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scene_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chapter_bridges" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "compilation_id" VARCHAR(64) NOT NULL,
  "from_chapter_id" VARCHAR(64),
  "to_chapter_id" VARCHAR(64),
  "target_order_index" INTEGER NOT NULL,
  "source_revision" INTEGER,
  "target_revision" INTEGER,
  "last_unfinished_action" TEXT NOT NULL DEFAULT '',
  "location" VARCHAR(160) NOT NULL DEFAULT '',
  "story_time" VARCHAR(160) NOT NULL DEFAULT '',
  "knowledge_state" JSONB NOT NULL,
  "body_state" JSONB NOT NULL,
  "object_state" JSONB NOT NULL,
  "relationship_state" JSONB NOT NULL,
  "emotion_aftermath" JSONB NOT NULL,
  "hook_decision" TEXT NOT NULL DEFAULT '',
  "delayed_hook_reason" TEXT NOT NULL DEFAULT '',
  "recent_openings" JSONB NOT NULL,
  "recent_endings" JSONB NOT NULL,
  "open_loops" JSONB NOT NULL,
  "committed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chapter_bridges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_charters_novel_id_key" ON "story_charters"("novel_id");
CREATE INDEX "story_charters_user_id_updated_at_idx" ON "story_charters"("user_id", "updated_at");
CREATE INDEX "reader_promises_user_id_status_idx" ON "reader_promises"("user_id", "status");
CREATE INDEX "reader_promises_novel_id_status_priority_idx" ON "reader_promises"("novel_id", "status", "priority");
CREATE INDEX "story_compilations_user_id_status_updated_at_idx" ON "story_compilations"("user_id", "status", "updated_at");
CREATE INDEX "story_compilations_novel_id_target_order_index_status_idx" ON "story_compilations"("novel_id", "target_order_index", "status");
CREATE INDEX "story_compilations_run_id_idx" ON "story_compilations"("run_id");
CREATE UNIQUE INDEX "scene_tasks_compilation_id_ordinal_key" ON "scene_tasks"("compilation_id", "ordinal");
CREATE INDEX "scene_tasks_novel_id_chapter_id_status_idx" ON "scene_tasks"("novel_id", "chapter_id", "status");
CREATE INDEX "scene_tasks_user_id_updated_at_idx" ON "scene_tasks"("user_id", "updated_at");
CREATE UNIQUE INDEX "chapter_bridges_compilation_id_key" ON "chapter_bridges"("compilation_id");
CREATE INDEX "chapter_bridges_novel_id_target_order_index_updated_at_idx" ON "chapter_bridges"("novel_id", "target_order_index", "updated_at");
CREATE INDEX "chapter_bridges_user_id_updated_at_idx" ON "chapter_bridges"("user_id", "updated_at");

ALTER TABLE "story_charters" ADD CONSTRAINT "story_charters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_charters" ADD CONSTRAINT "story_charters_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reader_promises" ADD CONSTRAINT "reader_promises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reader_promises" ADD CONSTRAINT "reader_promises_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_compilations" ADD CONSTRAINT "story_compilations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_compilations" ADD CONSTRAINT "story_compilations_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_compilations" ADD CONSTRAINT "story_compilations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "story_compilations" ADD CONSTRAINT "story_compilations_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scene_tasks" ADD CONSTRAINT "scene_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_tasks" ADD CONSTRAINT "scene_tasks_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_tasks" ADD CONSTRAINT "scene_tasks_compilation_id_fkey" FOREIGN KEY ("compilation_id") REFERENCES "story_compilations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_tasks" ADD CONSTRAINT "scene_tasks_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chapter_bridges" ADD CONSTRAINT "chapter_bridges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_bridges" ADD CONSTRAINT "chapter_bridges_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_bridges" ADD CONSTRAINT "chapter_bridges_compilation_id_fkey" FOREIGN KEY ("compilation_id") REFERENCES "story_compilations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_bridges" ADD CONSTRAINT "chapter_bridges_from_chapter_id_fkey" FOREIGN KEY ("from_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chapter_bridges" ADD CONSTRAINT "chapter_bridges_to_chapter_id_fkey" FOREIGN KEY ("to_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
