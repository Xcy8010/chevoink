ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'volumeSummary';
ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'storyArc';
ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'sceneState';
ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'relationshipState';
ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'storyBible';
ALTER TYPE "ProjectMemoryType" ADD VALUE IF NOT EXISTS 'authorProfile';

CREATE TYPE "StoryMemoryLayer" AS ENUM ('L0', 'L1', 'L2', 'L3');
CREATE TYPE "StoryMemoryStatus" AS ENUM ('confirmed', 'inferred', 'conflicted', 'superseded', 'invalid');
CREATE TYPE "MemoryReviewStatus" AS ENUM ('none', 'pending', 'accepted', 'rejected');
CREATE TYPE "MemorySourceType" AS ENUM ('chapter', 'volume', 'message', 'author_input', 'artifact');
CREATE TYPE "MemoryJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

ALTER TABLE "project_memory_entries"
  ADD COLUMN "layer" "StoryMemoryLayer" NOT NULL DEFAULT 'L1',
  ADD COLUMN "status" "StoryMemoryStatus" NOT NULL DEFAULT 'confirmed',
  ADD COLUMN "review_status" "MemoryReviewStatus" NOT NULL DEFAULT 'none',
  ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "embedding" JSONB;

CREATE TABLE "memory_evidence" (
  "id" VARCHAR(64) PRIMARY KEY,
  "memory_id" VARCHAR(64) NOT NULL,
  "source_type" "MemorySourceType" NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER,
  "span_start" INTEGER,
  "span_end" INTEGER,
  "quote_hash" VARCHAR(64),
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_evidence_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "project_memory_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "memory_evidence_memory_id_idx" ON "memory_evidence"("memory_id");
CREATE INDEX "memory_evidence_source_type_source_id_idx" ON "memory_evidence"("source_type", "source_id");

CREATE TABLE "memory_revisions" (
  "id" VARCHAR(64) PRIMARY KEY,
  "memory_id" VARCHAR(64) NOT NULL,
  "before" TEXT NOT NULL,
  "after" TEXT NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "superseded_by" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_revisions_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "project_memory_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "memory_revisions_memory_id_created_at_idx" ON "memory_revisions"("memory_id", "created_at");

CREATE TABLE "story_entities" (
  "id" VARCHAR(64) PRIMARY KEY,
  "novel_id" VARCHAR(64) NOT NULL,
  "entity_type" VARCHAR(32) NOT NULL,
  "canonical_name" VARCHAR(128) NOT NULL,
  "description" TEXT,
  "status" "StoryMemoryStatus" NOT NULL DEFAULT 'confirmed',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_entities_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "story_entities_novel_id_entity_type_canonical_name_key" UNIQUE ("novel_id", "entity_type", "canonical_name")
);
CREATE INDEX "story_entities_novel_id_canonical_name_idx" ON "story_entities"("novel_id", "canonical_name");

CREATE TABLE "entity_aliases" (
  "id" VARCHAR(64) PRIMARY KEY,
  "entity_id" VARCHAR(64) NOT NULL,
  "alias" VARCHAR(128) NOT NULL,
  "valid_from" INTEGER,
  "valid_to" INTEGER,
  "source_id" VARCHAR(64),
  CONSTRAINT "entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entity_aliases_entity_id_alias_key" UNIQUE ("entity_id", "alias")
);
CREATE INDEX "entity_aliases_alias_idx" ON "entity_aliases"("alias");

CREATE TABLE "entity_relations" (
  "id" VARCHAR(64) PRIMARY KEY,
  "from_entity_id" VARCHAR(64) NOT NULL,
  "to_entity_id" VARCHAR(64) NOT NULL,
  "relation_type" VARCHAR(64) NOT NULL,
  "state" TEXT,
  "valid_from" INTEGER,
  "valid_to" INTEGER,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER,
  CONSTRAINT "entity_relations_from_entity_id_fkey" FOREIGN KEY ("from_entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entity_relations_to_entity_id_fkey" FOREIGN KEY ("to_entity_id") REFERENCES "story_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entity_relations_from_to_type_from_key" UNIQUE ("from_entity_id", "to_entity_id", "relation_type", "valid_from")
);
CREATE INDEX "entity_relations_from_entity_id_idx" ON "entity_relations"("from_entity_id");
CREATE INDEX "entity_relations_to_entity_id_idx" ON "entity_relations"("to_entity_id");

CREATE TABLE "foreshadow_threads" (
  "id" VARCHAR(64) PRIMARY KEY,
  "novel_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "content" TEXT NOT NULL,
  "planted_at" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "resolved_at" VARCHAR(64),
  "source_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "foreshadow_threads_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "foreshadow_threads_novel_id_status_idx" ON "foreshadow_threads"("novel_id", "status");

CREATE TABLE "story_events" (
  "id" VARCHAR(64) PRIMARY KEY,
  "novel_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT NOT NULL,
  "story_time" VARCHAR(160),
  "location" VARCHAR(160),
  "participants" JSONB NOT NULL,
  "causes" JSONB NOT NULL,
  "effects" JSONB NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER,
  "status" "StoryMemoryStatus" NOT NULL DEFAULT 'inferred',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_events_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "story_events_novel_id_created_at_idx" ON "story_events"("novel_id", "created_at");

CREATE TABLE "memory_extraction_jobs" (
  "id" VARCHAR(64) PRIMARY KEY,
  "novel_id" VARCHAR(64) NOT NULL,
  "chapter_id" VARCHAR(64) NOT NULL,
  "chapter_revision" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL UNIQUE,
  "diff" JSONB NOT NULL,
  "status" "MemoryJobStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_until" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memory_extraction_jobs_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "memory_extraction_jobs_status_created_at_idx" ON "memory_extraction_jobs"("status", "created_at");
CREATE INDEX "memory_extraction_jobs_chapter_id_chapter_revision_idx" ON "memory_extraction_jobs"("chapter_id", "chapter_revision");

CREATE INDEX "project_memory_entries_search_trgm_idx" ON "project_memory_entries" USING GIN ((coalesce("title", '') || ' ' || coalesce("content", '')) gin_trgm_ops);
CREATE INDEX "project_memory_entries_novel_status_idx" ON "project_memory_entries"("novel_id", "status", "review_status");
