CREATE TABLE "style_learning_jobs" (
  "id" VARCHAR(64) NOT NULL, "request_id" VARCHAR(64) NOT NULL,
  "profile_id" VARCHAR(64) NOT NULL, "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
  "revision" INTEGER NOT NULL DEFAULT 0, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "pause_requested" BOOLEAN NOT NULL DEFAULT false, "selection" JSONB NOT NULL,
  "model_identity" JSONB NOT NULL, "chunks" JSONB NOT NULL,
  "reports" JSONB NOT NULL DEFAULT '[]', "rules" JSONB NOT NULL DEFAULT '[]',
  "processed" INTEGER NOT NULL DEFAULT 0, "response" TEXT, "error" TEXT,
  "lease_until" TIMESTAMP(3), "claim_token" VARCHAR(64), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "style_learning_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "style_learning_jobs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "style_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "style_learning_jobs_request_id_key" ON "style_learning_jobs"("request_id");
CREATE INDEX "style_learning_jobs_status_lease_until_idx" ON "style_learning_jobs"("status", "lease_until");
CREATE INDEX "style_learning_jobs_profile_id_created_at_idx" ON "style_learning_jobs"("profile_id", "created_at");
