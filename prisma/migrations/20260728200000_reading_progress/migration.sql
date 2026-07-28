-- 云端书架 + 阅读进度：每个用户对每本书一行，实现多设备同步
-- 有记录即在书架中；chapter_id 非空表示已开始阅读，scroll_percent 记录章内位置
CREATE TABLE "reading_progress" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "novel_title" VARCHAR(128) NOT NULL,
    "cover_url" TEXT,
    "chapter_id" VARCHAR(64),
    "chapter_title" VARCHAR(128),
    "chapter_order" INTEGER NOT NULL DEFAULT 0,
    "total_chapters" INTEGER NOT NULL DEFAULT 0,
    "scroll_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reading_progress_user_id_novel_id_key" ON "reading_progress"("user_id", "novel_id");

CREATE INDEX "reading_progress_user_id_idx" ON "reading_progress"("user_id");

ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
