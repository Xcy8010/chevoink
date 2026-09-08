CREATE TABLE "agent_event_projections" (
  "run_id" VARCHAR(64) NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "part_index" INTEGER NOT NULL DEFAULT 0,
  "event_id" VARCHAR(64) NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "event_hash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("run_id", "source_id", "part_index"),
  CONSTRAINT "agent_event_projections_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "agent_event_projections_run_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_event_projections_source_fkey" FOREIGN KEY ("source_id") REFERENCES "agent_execution_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_event_projections_event_fkey" FOREIGN KEY ("event_id") REFERENCES "agent_run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_event_projections_index_check" CHECK ("part_index" >= 0),
  CONSTRAINT "agent_event_projections_version_check" CHECK ("version" > 0)
);
