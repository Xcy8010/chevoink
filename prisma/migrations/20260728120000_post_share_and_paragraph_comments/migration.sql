-- 任务7：帖子支持分享作者主页（shared_user_id）
-- AlterTable
ALTER TABLE "public"."posts" ADD COLUMN "shared_user_id" VARCHAR(64);

-- CreateIndex
CREATE INDEX "posts_shared_user_id_idx" ON "public"."posts"("shared_user_id");

-- AddForeignKey
ALTER TABLE "public"."posts" ADD CONSTRAINT "posts_shared_user_id_fkey" FOREIGN KEY ("shared_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 任务9：章节段评（评论标注所属段落序号）
-- AlterTable
ALTER TABLE "public"."comments" ADD COLUMN "paragraph_index" INTEGER;
