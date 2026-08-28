CREATE TABLE "agent_skill_definitions" (
  "id" VARCHAR(160) NOT NULL,
  "owner_user_id" VARCHAR(64),
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "source" VARCHAR(24) NOT NULL,
  "visibility" VARCHAR(24) NOT NULL,
  "license" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "default_version" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_skill_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_skill_versions" (
  "id" VARCHAR(64) NOT NULL,
  "skill_id" VARCHAR(160) NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "instructions" JSONB NOT NULL,
  "manifest" JSONB NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_skill_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_skill_installations" (
  "id" VARCHAR(64) NOT NULL,
  "skill_id" VARCHAR(160) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "scope" VARCHAR(24) NOT NULL,
  "scope_id" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "locked_version" VARCHAR(32),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_skill_installations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_skill_definitions_owner_user_id_status_idx" ON "agent_skill_definitions"("owner_user_id", "status");
CREATE INDEX "agent_skill_definitions_source_status_idx" ON "agent_skill_definitions"("source", "status");
CREATE UNIQUE INDEX "agent_skill_versions_skill_id_version_key" ON "agent_skill_versions"("skill_id", "version");
CREATE INDEX "agent_skill_versions_skill_id_created_at_idx" ON "agent_skill_versions"("skill_id", "created_at");
CREATE UNIQUE INDEX "agent_skill_installations_skill_id_user_id_scope_scope_id_key" ON "agent_skill_installations"("skill_id", "user_id", "scope", "scope_id");
CREATE INDEX "agent_skill_installations_user_id_scope_scope_id_enabled_idx" ON "agent_skill_installations"("user_id", "scope", "scope_id", "enabled");

ALTER TABLE "agent_skill_versions"
  ADD CONSTRAINT "agent_skill_versions_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "agent_skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_skill_installations"
  ADD CONSTRAINT "agent_skill_installations_skill_id_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "agent_skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
