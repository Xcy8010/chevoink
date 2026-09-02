-- 用户反馈/建议：前台提交（含界面截图与联系方式），后台可标记已采纳/已忽略并撤销
CREATE TYPE "FeedbackKind" AS ENUM ('bug', 'suggestion');
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'accepted', 'ignored');

CREATE TABLE "feedbacks" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "kind" "FeedbackKind" NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
  "content" TEXT NOT NULL,
  "contact" VARCHAR(160),
  "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "source" VARCHAR(64),
  "page_url" VARCHAR(500),
  "client_info" JSONB NOT NULL DEFAULT '{}',
  "handled_by_admin_id" VARCHAR(64),
  "handled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedbacks_status_created_at_idx" ON "feedbacks"("status", "created_at");
CREATE INDEX "feedbacks_kind_status_created_at_idx" ON "feedbacks"("kind", "status", "created_at");
CREATE INDEX "feedbacks_user_id_created_at_idx" ON "feedbacks"("user_id", "created_at");

ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
