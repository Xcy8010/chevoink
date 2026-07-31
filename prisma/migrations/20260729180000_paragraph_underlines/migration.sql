-- 阅读器段落划线（方案 20 §2.7）：段级划线，user_id+chapter_id+paragraph_index 幂等唯一
CREATE TABLE "paragraph_underlines" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "chapter_id" VARCHAR(64) NOT NULL,
    "paragraph_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paragraph_underlines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paragraph_underlines_user_id_chapter_id_paragraph_index_key" ON "paragraph_underlines"("user_id", "chapter_id", "paragraph_index");

CREATE INDEX "paragraph_underlines_user_id_chapter_id_idx" ON "paragraph_underlines"("user_id", "chapter_id");

ALTER TABLE "paragraph_underlines" ADD CONSTRAINT "paragraph_underlines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paragraph_underlines" ADD CONSTRAINT "paragraph_underlines_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
