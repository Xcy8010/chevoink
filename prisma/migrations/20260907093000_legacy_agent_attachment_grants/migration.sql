-- Additive only. No inference/backfill from untrusted message references.
CREATE TABLE "legacy_agent_attachment_grants" (
    "url" VARCHAR(512) NOT NULL,
    "owner_user_id" VARCHAR(64) NOT NULL,
    "content_sha256" VARCHAR(64) NOT NULL,
    "evidence_ref" VARCHAR(512) NOT NULL,
    "approved_by" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "legacy_agent_attachment_grants_pkey" PRIMARY KEY ("url"),
    CONSTRAINT "legacy_agent_attachment_grants_hash_check" CHECK ("content_sha256" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "legacy_agent_attachment_grants_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "legacy_agent_attachment_grants_owner_user_id_idx" ON "legacy_agent_attachment_grants"("owner_user_id");
