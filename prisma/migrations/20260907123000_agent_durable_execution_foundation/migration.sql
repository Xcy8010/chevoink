-- B0 expansion only. Keep existing hand-written indexes, defaults and historical data.
ALTER TABLE "agent_runs"
  ADD COLUMN "runtime_protocol_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "task_root_id" VARCHAR(64);

CREATE TABLE "agent_task_roots" (
  "id" VARCHAR(64) PRIMARY KEY, "user_id" VARCHAR(64) NOT NULL,
  "session_id" VARCHAR(64) NOT NULL, "novel_id" VARCHAR(64) NOT NULL,
  "protocol_version" INTEGER NOT NULL DEFAULT 1, "authorization_mode" VARCHAR(24) NOT NULL DEFAULT 'legacy',
  "source_message_id" VARCHAR(64) NOT NULL, "input_hash" VARCHAR(64) NOT NULL,
  "spec_snapshot" JSONB NOT NULL, "request_snapshot" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "agent_run_leases" (
  "run_id" VARCHAR(64) PRIMARY KEY, "owner_id" VARCHAR(96), "claim_id" VARCHAR(64),
  "epoch" BIGINT NOT NULL DEFAULT 0, "expires_at" TIMESTAMP(3), "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_run_leases_epoch_nonnegative" CHECK ("epoch" >= 0)
);
CREATE TABLE "agent_operations" (
  "id" VARCHAR(64) PRIMARY KEY, "task_root_id" VARCHAR(64) NOT NULL, "operation_key" VARCHAR(160) NOT NULL,
  "parent_operation_id" VARCHAR(64), "origin_run_id" VARCHAR(64) NOT NULL,
  "kind" VARCHAR(24) NOT NULL, "action" VARCHAR(96) NOT NULL, "input_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'prepared',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "agent_provider_attempts" (
  "id" VARCHAR(64) PRIMARY KEY, "operation_id" VARCHAR(64) NOT NULL, "attempt_key" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64) NOT NULL, "owner_epoch" BIGINT NOT NULL,
  "provider" VARCHAR(96) NOT NULL, "model" VARCHAR(160) NOT NULL, "request_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'prepared', "dispatched_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "result" JSONB, "result_hash" VARCHAR(64), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "agent_provider_usage_receipts" (
  "attempt_id" VARCHAR(64) PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 1, "source" VARCHAR(24) NOT NULL,
  "prompt_tokens" INTEGER, "completion_tokens" INTEGER, "cache_hit_tokens" INTEGER, "cache_miss_tokens" INTEGER,
  "observation_hash" VARCHAR(64) NOT NULL, "settlement_status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_provider_usage_nonnegative" CHECK (
    "revision" > 0 AND ("prompt_tokens" IS NULL OR "prompt_tokens" >= 0)
    AND ("completion_tokens" IS NULL OR "completion_tokens" >= 0)
    AND ("cache_hit_tokens" IS NULL OR "cache_hit_tokens" >= 0)
    AND ("cache_miss_tokens" IS NULL OR "cache_miss_tokens" >= 0)
  )
);
CREATE TABLE "agent_effect_receipts" (
  "operation_id" VARCHAR(64) PRIMARY KEY, "run_id" VARCHAR(64) NOT NULL, "owner_epoch" BIGINT NOT NULL,
  "result" JSONB NOT NULL, "result_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "agent_execution_outbox" (
  "id" VARCHAR(64) PRIMARY KEY, "sequence" BIGSERIAL NOT NULL,
  "task_root_id" VARCHAR(64) NOT NULL, "operation_id" VARCHAR(64), "run_id" VARCHAR(64) NOT NULL,
  "event_key" VARCHAR(160) NOT NULL, "type" VARCHAR(48) NOT NULL, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMP(3)
);

CREATE INDEX "agent_task_roots_user_id_session_id_created_at_idx" ON "agent_task_roots"("user_id", "session_id", "created_at");
CREATE INDEX "agent_run_leases_enabled_expires_at_idx" ON "agent_run_leases"("enabled", "expires_at");
CREATE INDEX "agent_operations_task_root_id_status_created_at_idx" ON "agent_operations"("task_root_id", "status", "created_at");
CREATE UNIQUE INDEX "agent_operations_task_root_id_operation_key_key" ON "agent_operations"("task_root_id", "operation_key");
CREATE UNIQUE INDEX "agent_operations_id_task_root_id_key" ON "agent_operations"("id", "task_root_id");
CREATE INDEX "agent_provider_attempts_status_updated_at_idx" ON "agent_provider_attempts"("status", "updated_at");
CREATE UNIQUE INDEX "agent_provider_attempts_operation_id_attempt_key_key" ON "agent_provider_attempts"("operation_id", "attempt_key");
CREATE INDEX "agent_provider_usage_receipts_settlement_status_updated_at_idx" ON "agent_provider_usage_receipts"("settlement_status", "updated_at");
CREATE UNIQUE INDEX "agent_execution_outbox_sequence_key" ON "agent_execution_outbox"("sequence");
CREATE UNIQUE INDEX "agent_execution_outbox_event_key_key" ON "agent_execution_outbox"("event_key");
CREATE INDEX "agent_execution_outbox_published_at_sequence_idx" ON "agent_execution_outbox"("published_at", "sequence");
CREATE INDEX "agent_execution_outbox_run_id_sequence_idx" ON "agent_execution_outbox"("run_id", "sequence");
CREATE INDEX "agent_runs_task_root_id_created_at_idx" ON "agent_runs"("task_root_id", "created_at");

ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_root_id_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "agent_task_roots" ADD CONSTRAINT "agent_task_roots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_leases" ADD CONSTRAINT "agent_run_leases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_task_root_id_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_operations" ADD CONSTRAINT "agent_operations_parent_operation_id_task_root_id_fkey" FOREIGN KEY ("parent_operation_id", "task_root_id") REFERENCES "agent_operations"("id", "task_root_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "agent_provider_attempts" ADD CONSTRAINT "agent_provider_attempts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "agent_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_provider_usage_receipts" ADD CONSTRAINT "agent_provider_usage_receipts_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "agent_provider_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_effect_receipts" ADD CONSTRAINT "agent_effect_receipts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "agent_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_execution_outbox" ADD CONSTRAINT "agent_execution_outbox_task_root_id_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_execution_outbox" ADD CONSTRAINT "agent_execution_outbox_operation_id_task_root_id_fkey" FOREIGN KEY ("operation_id", "task_root_id") REFERENCES "agent_operations"("id", "task_root_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
