-- 作品评论评星：仅 targetType=novel 的根评论使用（1-5）
ALTER TABLE "comments" ADD COLUMN "rating" INTEGER;

-- 互动消息/新关注 未读红点的已读水位
ALTER TABLE "users" ADD COLUMN "interactions_seen_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "followers_seen_at" TIMESTAMP(3);

-- 作品收藏（独立于本地书架，计入 novels.favorite_count 并产生互动通知）
CREATE TABLE "novel_favorites" (
    "id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novel_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "novel_favorites_novel_id_user_id_key" ON "novel_favorites"("novel_id", "user_id");

CREATE INDEX "novel_favorites_user_id_idx" ON "novel_favorites"("user_id");

ALTER TABLE "novel_favorites" ADD CONSTRAINT "novel_favorites_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "novel_favorites" ADD CONSTRAINT "novel_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
