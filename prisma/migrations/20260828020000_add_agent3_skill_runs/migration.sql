CREATE TABLE "agent_skill_runs" (
  "id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "phase" VARCHAR(24) NOT NULL,
  "router_version" VARCHAR(32) NOT NULL,
  "candidates" JSONB NOT NULL,
  "selected" JSONB NOT NULL,
  "loaded" JSONB NOT NULL,
  "reason_codes" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "estimated_tokens" INTEGER NOT NULL DEFAULT 0,
  "quality_signals" JSONB,
  "accepted" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_skill_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_skill_runs_run_id_key" ON "agent_skill_runs"("run_id");
CREATE INDEX "agent_skill_runs_user_id_created_at_idx" ON "agent_skill_runs"("user_id", "created_at");
CREATE INDEX "agent_skill_runs_novel_id_created_at_idx" ON "agent_skill_runs"("novel_id", "created_at");

ALTER TABLE "agent_skill_runs"
  ADD CONSTRAINT "agent_skill_runs_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
