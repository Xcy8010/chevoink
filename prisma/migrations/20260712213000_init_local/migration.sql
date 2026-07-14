-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('user', 'author', 'admin');

-- CreateEnum
CREATE TYPE "public"."NovelStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "public"."ChapterStatus" AS ENUM ('draft', 'published', 'scheduled', 'archived');

-- CreateEnum
CREATE TYPE "public"."Visibility" AS ENUM ('public', 'followers', 'private');

-- CreateEnum
CREATE TYPE "public"."CommentTargetType" AS ENUM ('novel', 'chapter', 'post');

-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('text', 'novelCard', 'postCard', 'system');

-- CreateEnum
CREATE TYPE "public"."ConversationType" AS ENUM ('direct', 'system');

-- CreateEnum
CREATE TYPE "public"."CoverSourceType" AS ENUM ('upload', 'ai_generated');

-- CreateEnum
CREATE TYPE "public"."ContentAuditStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "public"."AiProviderType" AS ENUM ('text', 'image');

-- CreateEnum
CREATE TYPE "public"."AgentSessionStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "public"."AgentRunMode" AS ENUM ('plan', 'act', 'review');

-- CreateEnum
CREATE TYPE "public"."AgentRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."AgentType" AS ENUM ('writingOrchestrator', 'storyPlanner', 'draftWriter', 'continuityEditor', 'styleEditor', 'loreLibrarian', 'coverPromptAgent');

-- CreateEnum
CREATE TYPE "public"."AgentActionKind" AS ENUM ('planChapter', 'draftChapter', 'continueChapter', 'rewriteSelection', 'polishSelection', 'reviewContinuity', 'generateCoverPrompt');

-- CreateEnum
CREATE TYPE "public"."AgentArtifactType" AS ENUM ('chapterPlan', 'chapterDraft', 'chapterContinuation', 'rewriteSelection', 'polishSelection', 'continuityReview', 'coverPrompt');

-- CreateEnum
CREATE TYPE "public"."ProjectMemoryType" AS ENUM ('novelSummary', 'worldbuilding', 'characterCard', 'chapterSummary', 'timelineEvent', 'foreshadowing', 'stylePreference', 'continuityRule');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "password_hash" VARCHAR(255) NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'user',
    "is_author" BOOLEAN NOT NULL DEFAULT false,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "novel_count" INTEGER NOT NULL DEFAULT 0,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "unread_message_count" INTEGER NOT NULL DEFAULT 0,
    "unread_notification_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."novels" (
    "id" VARCHAR(64) NOT NULL,
    "author_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "display_title" VARCHAR(128),
    "slug" VARCHAR(160) NOT NULL,
    "summary" TEXT NOT NULL,
    "category_id" VARCHAR(64),
    "category_name" VARCHAR(64),
    "tag_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."NovelStatus" NOT NULL DEFAULT 'draft',
    "visibility" "public"."Visibility" NOT NULL DEFAULT 'public',
    "cover_asset_id" VARCHAR(64),
    "cover_prompt" TEXT,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "chapter_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_chapter_title" VARCHAR(128),
    "last_published_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chapters" (
    "id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "author_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."ChapterStatus" NOT NULL DEFAULT 'draft',
    "visibility" "public"."Visibility" NOT NULL DEFAULT 'public',
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comments" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "target_type" "public"."CommentTargetType" NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64),
    "chapter_id" VARCHAR(64),
    "post_id" VARCHAR(64),
    "parent_id" VARCHAR(64),
    "root_id" VARCHAR(64),
    "content" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "audit_status" "public"."ContentAuditStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."topics" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posts" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "topic_id" VARCHAR(64),
    "related_novel_id" VARCHAR(64),
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(240) NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "audit_status" "public"."ContentAuditStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" VARCHAR(64) NOT NULL,
    "type" "public"."ConversationType" NOT NULL DEFAULT 'direct',
    "title" VARCHAR(128),
    "avatar_url" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_preview" VARCHAR(240),
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_members" (
    "id" VARCHAR(64) NOT NULL,
    "conversation_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" VARCHAR(64) NOT NULL,
    "conversation_id" VARCHAR(64) NOT NULL,
    "sender_id" VARCHAR(64) NOT NULL,
    "type" "public"."MessageType" NOT NULL,
    "content" TEXT NOT NULL,
    "related_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cover_assets" (
    "id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64),
    "owner_user_id" VARCHAR(64) NOT NULL,
    "source_type" "public"."CoverSourceType" NOT NULL,
    "image_url" TEXT NOT NULL,
    "prompt" TEXT,
    "negative_prompt" TEXT,
    "model_name" VARCHAR(128),
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cover_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_usage_logs" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64),
    "chapter_id" VARCHAR(64),
    "cover_asset_id" VARCHAR(64),
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(64),
    "provider_type" "public"."AiProviderType" NOT NULL,
    "provider_mode" VARCHAR(16) NOT NULL,
    "model_name" VARCHAR(128) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "request_tokens" INTEGER,
    "response_tokens" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_sessions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "status" "public"."AgentSessionStatus" NOT NULL DEFAULT 'active',
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_runs" (
    "id" VARCHAR(64) NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "chapter_id" VARCHAR(64),
    "mode" "public"."AgentRunMode" NOT NULL,
    "action" "public"."AgentActionKind" NOT NULL,
    "agent_type" "public"."AgentType" NOT NULL,
    "status" "public"."AgentRunStatus" NOT NULL DEFAULT 'queued',
    "input_summary" TEXT,
    "output_summary" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_artifacts" (
    "id" VARCHAR(64) NOT NULL,
    "run_id" VARCHAR(64) NOT NULL,
    "artifact_type" "public"."AgentArtifactType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_memory_entries" (
    "id" VARCHAR(64) NOT NULL,
    "run_id" VARCHAR(64),
    "novel_id" VARCHAR(64) NOT NULL,
    "source_chapter_id" VARCHAR(64),
    "memory_type" "public"."ProjectMemoryType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 50,
    "embedding_ref" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "novels_slug_key" ON "public"."novels"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "novels_cover_asset_id_key" ON "public"."novels"("cover_asset_id");

-- CreateIndex
CREATE INDEX "novels_author_id_idx" ON "public"."novels"("author_id");

-- CreateIndex
CREATE INDEX "novels_status_visibility_idx" ON "public"."novels"("status", "visibility");

-- CreateIndex
CREATE INDEX "novels_category_id_idx" ON "public"."novels"("category_id");

-- CreateIndex
CREATE INDEX "chapters_novel_id_status_idx" ON "public"."chapters"("novel_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_novel_id_order_index_key" ON "public"."chapters"("novel_id", "order_index");

-- CreateIndex
CREATE INDEX "comments_target_type_target_id_idx" ON "public"."comments"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "public"."comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_novel_id_idx" ON "public"."comments"("novel_id");

-- CreateIndex
CREATE INDEX "comments_chapter_id_idx" ON "public"."comments"("chapter_id");

-- CreateIndex
CREATE INDEX "comments_post_id_idx" ON "public"."comments"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_name_key" ON "public"."topics"("name");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "public"."topics"("slug");

-- CreateIndex
CREATE INDEX "posts_user_id_idx" ON "public"."posts"("user_id");

-- CreateIndex
CREATE INDEX "posts_topic_id_idx" ON "public"."posts"("topic_id");

-- CreateIndex
CREATE INDEX "posts_related_novel_id_idx" ON "public"."posts"("related_novel_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "public"."conversation_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key" ON "public"."conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "public"."messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "cover_assets_owner_user_id_idx" ON "public"."cover_assets"("owner_user_id");

-- CreateIndex
CREATE INDEX "cover_assets_novel_id_idx" ON "public"."cover_assets"("novel_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "public"."ai_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_target_type_target_id_idx" ON "public"."ai_usage_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "agent_sessions_user_id_novel_id_idx" ON "public"."agent_sessions"("user_id", "novel_id");

-- CreateIndex
CREATE INDEX "agent_sessions_novel_id_updated_at_idx" ON "public"."agent_sessions"("novel_id", "updated_at");

-- CreateIndex
CREATE INDEX "agent_runs_session_id_created_at_idx" ON "public"."agent_runs"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_created_at_idx" ON "public"."agent_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_novel_id_created_at_idx" ON "public"."agent_runs"("novel_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_artifacts_run_id_created_at_idx" ON "public"."agent_artifacts"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "project_memory_entries_run_id_idx" ON "public"."project_memory_entries"("run_id");

-- CreateIndex
CREATE INDEX "project_memory_entries_novel_id_memory_type_idx" ON "public"."project_memory_entries"("novel_id", "memory_type");

-- CreateIndex
CREATE INDEX "project_memory_entries_source_chapter_id_idx" ON "public"."project_memory_entries"("source_chapter_id");

-- AddForeignKey
ALTER TABLE "public"."novels" ADD CONSTRAINT "novels_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."novels" ADD CONSTRAINT "novels_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."cover_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chapters" ADD CONSTRAINT "chapters_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chapters" ADD CONSTRAINT "chapters_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_related_novel_id_fkey" FOREIGN KEY ("related_novel_id") REFERENCES "public"."novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cover_assets" ADD CONSTRAINT "cover_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cover_assets" ADD CONSTRAINT "cover_assets_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_sessions" ADD CONSTRAINT "agent_sessions_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_runs" ADD CONSTRAINT "agent_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_runs" ADD CONSTRAINT "agent_runs_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_runs" ADD CONSTRAINT "agent_runs_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_artifacts" ADD CONSTRAINT "agent_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_memory_entries" ADD CONSTRAINT "project_memory_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_memory_entries" ADD CONSTRAINT "project_memory_entries_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_memory_entries" ADD CONSTRAINT "project_memory_entries_source_chapter_id_fkey" FOREIGN KEY ("source_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

