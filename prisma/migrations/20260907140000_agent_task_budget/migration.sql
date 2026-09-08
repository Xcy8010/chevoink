-- Additive: old task roots remain explicitly unbudgeted, never silently reset/backfilled.
CREATE TABLE "agent_task_budgets" (
  "task_root_id" VARCHAR(64) NOT NULL,
  "policy" JSONB NOT NULL,
  "policy_hash" VARCHAR(64) NOT NULL,
  "token_limit" INTEGER NOT NULL,
  "checkpoint_count" INTEGER NOT NULL DEFAULT 0,
  "compaction_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_task_budgets_pkey" PRIMARY KEY ("task_root_id"),
  CONSTRAINT "agent_task_budgets_task_root_id_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_task_budgets_counts_check" CHECK ("token_limit" >= 500 AND "checkpoint_count" >= 0 AND "compaction_count" >= 0)
);
