CREATE TABLE "agent_research_sources" (
  "id" VARCHAR(64) NOT NULL PRIMARY KEY,
  "owner_run_id" VARCHAR(64) NOT NULL,
  "task_key" VARCHAR(200) NOT NULL,
  "url_hash" VARCHAR(64) NOT NULL,
  "canonical_url" VARCHAR(8192) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_research_sources_owner_run_id_fkey" FOREIGN KEY ("owner_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_research_sources_owner_run_id_task_key_url_hash_key" ON "agent_research_sources"("owner_run_id", "task_key", "url_hash");
CREATE INDEX "agent_research_sources_task_key_created_at_idx" ON "agent_research_sources"("task_key", "created_at");
CREATE TABLE "agent_research_contents" (
  "id" VARCHAR(64) NOT NULL PRIMARY KEY,
  "source_id" VARCHAR(64) NOT NULL,
  "revision" VARCHAR(64) NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "final_url" VARCHAR(8192) NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "content_kind" VARCHAR(24) NOT NULL,
  "text" TEXT NOT NULL,
  "quality" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_research_contents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "agent_research_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_research_contents_source_id_revision_key" ON "agent_research_contents"("source_id", "revision");
CREATE INDEX "agent_research_contents_source_id_created_at_idx" ON "agent_research_contents"("source_id", "created_at");
