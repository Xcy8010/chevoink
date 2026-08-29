CREATE TYPE "ResearchDossierStatus" AS ENUM ('draft', 'ready', 'stale', 'failed');
CREATE TYPE "ResearchTriggerReason" AS ENUM ('new_book', 'new_genre', 'new_arc', 'factual_risk', 'author_request', 'quality_stagnation');
CREATE TYPE "FirstThreePrototypeStatus" AS ENUM ('planning', 'ready', 'writing', 'quality_review', 'completed', 'abandoned');
CREATE TYPE "WritingExperimentKind" AS ENUM ('first_three_direction', 'quality_revision', 'craft_retrieval');
CREATE TYPE "WritingExperimentStatus" AS ENUM ('active', 'completed', 'withdrawn');
CREATE TYPE "SkillShareInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');

CREATE TABLE "research_dossiers" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64),
  "version" INTEGER NOT NULL,
  "status" "ResearchDossierStatus" NOT NULL DEFAULT 'draft',
  "trigger_reason" "ResearchTriggerReason" NOT NULL,
  "trigger_signals" JSONB NOT NULL,
  "topic" VARCHAR(240) NOT NULL,
  "genre" VARCHAR(96) NOT NULL,
  "target_audience" VARCHAR(500) NOT NULL,
  "target_platform" VARCHAR(160) NOT NULL DEFAULT '',
  "reader_promise" TEXT NOT NULL,
  "abandonment_risks" JSONB NOT NULL,
  "market_patterns" JSONB NOT NULL,
  "differentiation" JSONB NOT NULL,
  "fact_cards" JSONB NOT NULL,
  "language_risks" JSONB NOT NULL,
  "recommendations" JSONB NOT NULL,
  "rejected_ideas" JSONB NOT NULL,
  "query_plan" JSONB NOT NULL,
  "sources" JSONB NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "cache_key" VARCHAR(64) NOT NULL,
  "search_count" INTEGER NOT NULL DEFAULT 0,
  "estimated_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "build_duration_ms" INTEGER NOT NULL DEFAULT 0,
  "reused_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "research_dossiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "first_three_prototypes" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "dossier_id" VARCHAR(64),
  "version" INTEGER NOT NULL,
  "status" "FirstThreePrototypeStatus" NOT NULL DEFAULT 'planning',
  "genre_risks" JSONB NOT NULL,
  "directions" JSONB NOT NULL,
  "selected_direction" JSONB,
  "volume_spine" JSONB NOT NULL,
  "chapter_blueprints" JSONB NOT NULL,
  "completed_chapters" INTEGER NOT NULL DEFAULT 0,
  "passed_chapters" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "first_three_prototypes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "writing_experiments" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "kind" "WritingExperimentKind" NOT NULL,
  "status" "WritingExperimentStatus" NOT NULL DEFAULT 'active',
  "subject_hash" VARCHAR(64) NOT NULL,
  "arm" VARCHAR(64) NOT NULL,
  "feature_versions" JSONB NOT NULL,
  "exposure" JSONB NOT NULL,
  "outcomes" JSONB NOT NULL,
  "consent_snapshot" JSONB NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "writing_experiments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_data_controls" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "quality_telemetry_enabled" BOOLEAN NOT NULL DEFAULT true,
  "product_analytics_enabled" BOOLEAN NOT NULL DEFAULT true,
  "private_style_enabled" BOOLEAN NOT NULL DEFAULT true,
  "public_corpus_opt_in" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_data_controls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_share_invites" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "recipient_user_id" VARCHAR(64) NOT NULL,
  "skill_id" VARCHAR(160) NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "status" "SkillShareInviteStatus" NOT NULL DEFAULT 'pending',
  "token_hash" VARCHAR(64) NOT NULL,
  "message" VARCHAR(500) NOT NULL DEFAULT '',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_share_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "research_dossiers_novel_id_version_key" ON "research_dossiers"("novel_id", "version");
CREATE INDEX "research_dossiers_user_id_status_updated_at_idx" ON "research_dossiers"("user_id", "status", "updated_at");
CREATE INDEX "research_dossiers_novel_id_expires_at_status_idx" ON "research_dossiers"("novel_id", "expires_at", "status");
CREATE INDEX "research_dossiers_cache_key_idx" ON "research_dossiers"("cache_key");
CREATE UNIQUE INDEX "first_three_prototypes_novel_id_version_key" ON "first_three_prototypes"("novel_id", "version");
CREATE INDEX "first_three_prototypes_user_id_status_updated_at_idx" ON "first_three_prototypes"("user_id", "status", "updated_at");
CREATE INDEX "first_three_prototypes_novel_id_status_idx" ON "first_three_prototypes"("novel_id", "status");
CREATE INDEX "writing_experiments_user_id_status_updated_at_idx" ON "writing_experiments"("user_id", "status", "updated_at");
CREATE INDEX "writing_experiments_novel_id_kind_status_idx" ON "writing_experiments"("novel_id", "kind", "status");
CREATE INDEX "writing_experiments_subject_hash_idx" ON "writing_experiments"("subject_hash");
CREATE UNIQUE INDEX "agent_data_controls_user_id_novel_id_key" ON "agent_data_controls"("user_id", "novel_id");
CREATE INDEX "agent_data_controls_novel_id_updated_at_idx" ON "agent_data_controls"("novel_id", "updated_at");
CREATE UNIQUE INDEX "skill_share_invites_token_hash_key" ON "skill_share_invites"("token_hash");
CREATE INDEX "skill_share_invites_user_id_novel_id_status_idx" ON "skill_share_invites"("user_id", "novel_id", "status");
CREATE INDEX "skill_share_invites_recipient_user_id_status_expires_at_idx" ON "skill_share_invites"("recipient_user_id", "status", "expires_at");
CREATE INDEX "skill_share_invites_skill_id_version_idx" ON "skill_share_invites"("skill_id", "version");

ALTER TABLE "research_dossiers" ADD CONSTRAINT "research_dossiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_dossiers" ADD CONSTRAINT "research_dossiers_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "first_three_prototypes" ADD CONSTRAINT "first_three_prototypes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "first_three_prototypes" ADD CONSTRAINT "first_three_prototypes_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "first_three_prototypes" ADD CONSTRAINT "first_three_prototypes_dossier_id_fkey" FOREIGN KEY ("dossier_id") REFERENCES "research_dossiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "writing_experiments" ADD CONSTRAINT "writing_experiments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "writing_experiments" ADD CONSTRAINT "writing_experiments_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_data_controls" ADD CONSTRAINT "agent_data_controls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_data_controls" ADD CONSTRAINT "agent_data_controls_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_share_invites" ADD CONSTRAINT "skill_share_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_share_invites" ADD CONSTRAINT "skill_share_invites_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_share_invites" ADD CONSTRAINT "skill_share_invites_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_share_invites" ADD CONSTRAINT "skill_share_invites_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "agent_skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
