CREATE TABLE "agent_execution_states" (
  "task_root_id" VARCHAR(64) NOT NULL PRIMARY KEY,
  "configuration" JSONB NOT NULL,
  "configuration_hash" VARCHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_execution_states_root_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_execution_states_revision_check" CHECK ("revision" >= 0)
);
CREATE TABLE "agent_execution_frames" (
  "task_root_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "origin_run_id" VARCHAR(64) NOT NULL,
  "previous_hash" VARCHAR(64),
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("task_root_id", "revision"),
  CONSTRAINT "agent_execution_frames_root_fkey" FOREIGN KEY ("task_root_id") REFERENCES "agent_task_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_execution_frames_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "agent_execution_frames_parent_check" CHECK (("revision" = 0 AND "previous_hash" IS NULL) OR ("revision" > 0 AND "previous_hash" IS NOT NULL))
);
