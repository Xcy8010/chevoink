CREATE TYPE "ChangeSetStatus" AS ENUM ('draft', 'approved', 'applying', 'applied', 'conflicted', 'failed', 'rolled_back');

CREATE TABLE "change_sets" (
  "id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "task_spec_id" VARCHAR(64) NOT NULL,
  "status" "ChangeSetStatus" NOT NULL DEFAULT 'draft',
  "base_revision" INTEGER NOT NULL DEFAULT 0,
  "validations" JSONB NOT NULL,
  "snapshot_id" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "change_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "change_set_patches" (
  "id" VARCHAR(64) NOT NULL,
  "change_set_id" VARCHAR(64) NOT NULL,
  "target_type" VARCHAR(24) NOT NULL,
  "target_id" VARCHAR(64) NOT NULL,
  "field" VARCHAR(32) NOT NULL,
  "before_hash" VARCHAR(64) NOT NULL,
  "expected_revision" INTEGER NOT NULL,
  "applied_revision" INTEGER,
  "anchor" TEXT,
  "before" TEXT,
  "after" TEXT,
  "reason" TEXT NOT NULL,
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "change_set_patches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_sets_novel_id_created_at_idx" ON "change_sets"("novel_id", "created_at");
CREATE INDEX "change_sets_user_id_status_idx" ON "change_sets"("user_id", "status");
CREATE INDEX "change_set_patches_change_set_id_selected_idx" ON "change_set_patches"("change_set_id", "selected");
CREATE INDEX "change_set_patches_target_type_target_id_idx" ON "change_set_patches"("target_type", "target_id");

ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_set_patches" ADD CONSTRAINT "change_set_patches_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 中文姓名/短语精确与模糊检索使用 trigram；写章节时索引由 PostgreSQL 同步维护，无异步漏窗。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "chapters_title_trgm_idx" ON "chapters" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "chapters_summary_trgm_idx" ON "chapters" USING GIN ("summary" gin_trgm_ops);
CREATE INDEX "chapters_content_trgm_idx" ON "chapters" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "chapters_search_fts_idx" ON "chapters" USING GIN (
  to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("content", ''))
);
