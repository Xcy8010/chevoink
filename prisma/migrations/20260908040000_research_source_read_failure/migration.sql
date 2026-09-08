-- Short-lived, task-private negative cache. No source text or credentials.
ALTER TABLE "agent_research_sources" ADD COLUMN "read_failure" JSONB;
