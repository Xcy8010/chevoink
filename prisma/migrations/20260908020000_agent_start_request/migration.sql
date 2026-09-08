-- Preserve admitted input before the executor starts. Historical rows remain
-- NULL: a display summary must never be backfilled as the original request.
ALTER TABLE "agent_runs" ADD COLUMN "start_request" JSONB;
