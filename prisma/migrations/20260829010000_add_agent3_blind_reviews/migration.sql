CREATE TABLE "agent_eval_suites" (
  "id" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "dataset_version" VARCHAR(64) NOT NULL,
  "rubric_version" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "created_by_admin_id" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_eval_suites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_eval_samples" (
  "id" VARCHAR(64) NOT NULL,
  "suite_id" VARCHAR(64) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "genre" VARCHAR(48) NOT NULL,
  "task" VARCHAR(48) NOT NULL,
  "style" VARCHAR(48) NOT NULL,
  "evaluation_brief" TEXT NOT NULL,
  "source_class" VARCHAR(32) NOT NULL,
  "source_reference_hash" VARCHAR(64) NOT NULL,
  "consent_receipt_id" VARCHAR(160),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_eval_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_eval_candidates" (
  "id" VARCHAR(64) NOT NULL,
  "sample_id" VARCHAR(64) NOT NULL,
  "blind_label" VARCHAR(8) NOT NULL,
  "origin" VARCHAR(24) NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_eval_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_blind_reviews" (
  "id" VARCHAR(64) NOT NULL,
  "sample_id" VARCHAR(64) NOT NULL,
  "reviewer_hash" VARCHAR(64) NOT NULL,
  "candidate_ratings" JSONB NOT NULL,
  "guessed_origins" JSONB NOT NULL,
  "mechanical_reasons" JSONB NOT NULL,
  "preferred_label" VARCHAR(8) NOT NULL,
  "notes" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_blind_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_eval_suites_status_created_at_idx" ON "agent_eval_suites"("status", "created_at");
CREATE UNIQUE INDEX "agent_eval_samples_suite_id_code_key" ON "agent_eval_samples"("suite_id", "code");
CREATE INDEX "agent_eval_samples_suite_id_created_at_idx" ON "agent_eval_samples"("suite_id", "created_at");
CREATE UNIQUE INDEX "agent_eval_candidates_sample_id_blind_label_key" ON "agent_eval_candidates"("sample_id", "blind_label");
CREATE INDEX "agent_eval_candidates_sample_id_origin_idx" ON "agent_eval_candidates"("sample_id", "origin");
CREATE UNIQUE INDEX "agent_blind_reviews_sample_id_reviewer_hash_key" ON "agent_blind_reviews"("sample_id", "reviewer_hash");
CREATE INDEX "agent_blind_reviews_reviewer_hash_submitted_at_idx" ON "agent_blind_reviews"("reviewer_hash", "submitted_at");

ALTER TABLE "agent_eval_samples" ADD CONSTRAINT "agent_eval_samples_suite_id_fkey"
  FOREIGN KEY ("suite_id") REFERENCES "agent_eval_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_eval_candidates" ADD CONSTRAINT "agent_eval_candidates_sample_id_fkey"
  FOREIGN KEY ("sample_id") REFERENCES "agent_eval_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_blind_reviews" ADD CONSTRAINT "agent_blind_reviews_sample_id_fkey"
  FOREIGN KEY ("sample_id") REFERENCES "agent_eval_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
