CREATE TABLE "agent_runtime_checkpoints" (
  "task_root_id" VARCHAR(64) NOT NULL,
  "checkpoint_index" INTEGER NOT NULL,
  "origin_run_id" VARCHAR(64) NOT NULL,
  "progress_operation_id" VARCHAR(64) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_runtime_checkpoints_pkey" PRIMARY KEY ("task_root_id", "checkpoint_index"),
  CONSTRAINT "agent_runtime_checkpoints_task_root_id_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_runtime_checkpoints_progress_operation_id_task_root_id_fkey" FOREIGN KEY ("progress_operation_id", "task_root_id") REFERENCES "agent_operations"("id", "task_root_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "agent_runtime_checkpoints_index_check" CHECK ("checkpoint_index" > 0)
);
CREATE UNIQUE INDEX "agent_runtime_checkpoints_progress_operation_id_key" ON "agent_runtime_checkpoints"("progress_operation_id");
