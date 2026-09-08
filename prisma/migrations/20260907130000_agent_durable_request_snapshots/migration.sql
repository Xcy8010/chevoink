-- Separate expansion: never rewrite an already applied migration or fabricate old request bodies.
ALTER TABLE "agent_operations" ADD COLUMN "input_snapshot" JSONB;
ALTER TABLE "agent_provider_attempts" ADD COLUMN "request_snapshot" JSONB;
