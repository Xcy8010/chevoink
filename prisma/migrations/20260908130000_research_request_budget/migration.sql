CREATE TABLE "agent_research_requests" (
  "id" VARCHAR(64) NOT NULL,
  "owner_run_id" VARCHAR(64) NOT NULL,
  "scope_key" VARCHAR(64) NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1 CHECK ("units" >= 0),
  "request_key" VARCHAR(64) NOT NULL,
  "request_limit" INTEGER NOT NULL CHECK ("request_limit" > 0),
  "status" VARCHAR(24) NOT NULL DEFAULT 'reserved',
  "saved_outcome" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_research_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_research_requests_owner_run_id_fkey" FOREIGN KEY ("owner_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_research_requests_kind_check" CHECK ("kind" IN ('search', 'read')),
  CONSTRAINT "agent_research_requests_status_check" CHECK ("status" IN ('baseline', 'reserved', 'consumed', 'released'))
);
CREATE INDEX "agent_research_requests_scope_key_kind_idx" ON "agent_research_requests"("scope_key", "kind");

-- Existing extractions are not silently treated as model-read material.
ALTER TABLE "agent_research_contents" ADD COLUMN "provided_ranges" JSONB NOT NULL DEFAULT '[]';
