ALTER TABLE "chapters"
  ADD COLUMN "published_title" VARCHAR(128),
  ADD COLUMN "published_summary" TEXT,
  ADD COLUMN "published_content" TEXT,
  ADD COLUMN "published_word_count" INTEGER,
  ADD COLUMN "published_revision" INTEGER;

-- 已发布存量章节以当前内容初始化读者快照；之后创作稿与读者稿独立推进。
UPDATE "chapters"
SET
  "published_title" = "title",
  "published_summary" = "summary",
  "published_content" = "content",
  "published_word_count" = "word_count",
  "published_revision" = "revision"
WHERE "status" = 'published';
