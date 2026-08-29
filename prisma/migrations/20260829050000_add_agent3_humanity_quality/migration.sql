CREATE TYPE "ChapterQualityStatus" AS ENUM ('analyzing', 'needs_repair', 'passed', 'repaired', 'stale', 'failed');
CREATE TYPE "QualityFindingSource" AS ENUM ('deterministic', 'critic');
CREATE TYPE "QualityFindingSeverity" AS ENUM ('advisory', 'warning', 'error');
CREATE TYPE "QualityFindingDisposition" AS ENUM ('pending', 'selected', 'repaired');
CREATE TYPE "QualityFindingFeedback" AS ENUM ('accepted', 'rejected');
CREATE TYPE "CreativeProfileStatus" AS ENUM ('draft', 'confirmed', 'archived');

CREATE TABLE "character_voice_profiles" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "character_name" VARCHAR(128) NOT NULL,
  "status" "CreativeProfileStatus" NOT NULL DEFAULT 'draft',
  "vocabulary_level" VARCHAR(240) NOT NULL,
  "sentence_length" JSONB NOT NULL,
  "address_system" JSONB NOT NULL,
  "pressure_response" TEXT NOT NULL,
  "avoided_topics" JSONB NOT NULL,
  "attention_bias" JSONB NOT NULL,
  "voice_samples" JSONB NOT NULL,
  "forbidden_knowledge" JSONB NOT NULL,
  "evolution_notes" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "character_voice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "experience_anchors" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "character_name" VARCHAR(128) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "trigger_event" TEXT NOT NULL,
  "concrete_detail" TEXT NOT NULL,
  "sensory_cue" TEXT NOT NULL DEFAULT '',
  "habitual_response" TEXT NOT NULL,
  "emotional_meaning" TEXT NOT NULL,
  "source_type" "MemorySourceType" NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "source_revision" INTEGER,
  "status" "StoryMemoryStatus" NOT NULL DEFAULT 'confirmed',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "experience_anchors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chapter_quality_reports" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "run_id" VARCHAR(64),
  "compilation_id" VARCHAR(64),
  "chapter_id" VARCHAR(64) NOT NULL,
  "chapter_revision" INTEGER NOT NULL,
  "mode" "StoryCompilerMode" NOT NULL DEFAULT 'balanced',
  "status" "ChapterQualityStatus" NOT NULL DEFAULT 'analyzing',
  "repair_round" INTEGER NOT NULL DEFAULT 0,
  "deterministic_metrics" JSONB NOT NULL,
  "critic_version" VARCHAR(64) NOT NULL DEFAULT 'humanity-critic.v1',
  "checked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chapter_quality_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_findings" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "report_id" VARCHAR(64) NOT NULL,
  "signal" VARCHAR(48) NOT NULL,
  "source" "QualityFindingSource" NOT NULL,
  "severity" "QualityFindingSeverity" NOT NULL,
  "start_offset" INTEGER NOT NULL,
  "end_offset" INTEGER NOT NULL,
  "evidence_excerpt" VARCHAR(360) NOT NULL,
  "evidence_hash" VARCHAR(64) NOT NULL,
  "explanation" TEXT NOT NULL,
  "suggestion" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "disposition" "QualityFindingDisposition" NOT NULL DEFAULT 'pending',
  "author_feedback" "QualityFindingFeedback",
  "feedback_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "character_voice_profiles_novel_id_character_name_key" ON "character_voice_profiles"("novel_id", "character_name");
CREATE INDEX "character_voice_profiles_user_id_status_updated_at_idx" ON "character_voice_profiles"("user_id", "status", "updated_at");
CREATE UNIQUE INDEX "experience_anchors_novel_id_character_name_title_source_id_key" ON "experience_anchors"("novel_id", "character_name", "title", "source_id");
CREATE INDEX "experience_anchors_user_id_character_name_status_idx" ON "experience_anchors"("user_id", "character_name", "status");
CREATE INDEX "experience_anchors_novel_id_character_name_updated_at_idx" ON "experience_anchors"("novel_id", "character_name", "updated_at");
CREATE INDEX "chapter_quality_reports_user_id_created_at_idx" ON "chapter_quality_reports"("user_id", "created_at");
CREATE INDEX "chapter_quality_reports_novel_id_chapter_id_chapter_revision_idx" ON "chapter_quality_reports"("novel_id", "chapter_id", "chapter_revision");
CREATE INDEX "chapter_quality_reports_compilation_id_repair_round_idx" ON "chapter_quality_reports"("compilation_id", "repair_round");
CREATE UNIQUE INDEX "quality_findings_report_id_source_signal_evidence_hash_key" ON "quality_findings"("report_id", "source", "signal", "evidence_hash");
CREATE INDEX "quality_findings_user_id_disposition_updated_at_idx" ON "quality_findings"("user_id", "disposition", "updated_at");
CREATE INDEX "quality_findings_novel_id_signal_disposition_idx" ON "quality_findings"("novel_id", "signal", "disposition");
CREATE INDEX "quality_findings_novel_id_signal_author_feedback_idx" ON "quality_findings"("novel_id", "signal", "author_feedback");

ALTER TABLE "character_voice_profiles" ADD CONSTRAINT "character_voice_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_voice_profiles" ADD CONSTRAINT "character_voice_profiles_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "experience_anchors" ADD CONSTRAINT "experience_anchors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "experience_anchors" ADD CONSTRAINT "experience_anchors_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_quality_reports" ADD CONSTRAINT "chapter_quality_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_quality_reports" ADD CONSTRAINT "chapter_quality_reports_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_quality_reports" ADD CONSTRAINT "chapter_quality_reports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chapter_quality_reports" ADD CONSTRAINT "chapter_quality_reports_compilation_id_fkey" FOREIGN KEY ("compilation_id") REFERENCES "story_compilations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chapter_quality_reports" ADD CONSTRAINT "chapter_quality_reports_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_findings" ADD CONSTRAINT "quality_findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "chapter_quality_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
