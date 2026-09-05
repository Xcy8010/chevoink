CREATE TABLE "agent_queued_requests" (
  "id" VARCHAR(64) PRIMARY KEY,
  "sequence" SERIAL NOT NULL UNIQUE,
  "session_id" VARCHAR(64) NOT NULL REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "run_id" VARCHAR(64) UNIQUE,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "agent_queued_requests_status_created_at_idx" ON "agent_queued_requests"("status", "created_at");
CREATE INDEX "agent_queued_requests_session_id_status_priority_sequence_idx" ON "agent_queued_requests"("session_id", "status", "priority", "sequence");
