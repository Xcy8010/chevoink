CREATE TABLE "agent_skill_audits" (
  "id" VARCHAR(64) NOT NULL,
  "skill_id" VARCHAR(160) NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "findings" JSONB NOT NULL DEFAULT '[]',
  "manifest_hash" VARCHAR(64) NOT NULL,
  "created_by_user_id" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_skill_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_skill_evals" (
  "id" VARCHAR(64) NOT NULL,
  "skill_id" VARCHAR(160) NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "prompt_hash" VARCHAR(64) NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_skill_evals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_skill_audits_skill_id_version_created_at_idx" ON "agent_skill_audits"("skill_id", "version", "created_at");
CREATE INDEX "agent_skill_evals_skill_id_version_created_at_idx" ON "agent_skill_evals"("skill_id", "version", "created_at");
CREATE INDEX "agent_skill_evals_user_id_novel_id_created_at_idx" ON "agent_skill_evals"("user_id", "novel_id", "created_at");

ALTER TABLE "agent_skill_audits" ADD CONSTRAINT "agent_skill_audits_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "agent_skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_skill_evals" ADD CONSTRAINT "agent_skill_evals_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "agent_skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
