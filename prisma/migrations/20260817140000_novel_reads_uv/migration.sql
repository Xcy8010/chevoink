-- 读者去重表（阅读数 UV 化）：一人一作品仅一条，首次阅读写入后重读不累加；
-- viewCount 对外语义由「打开次数 PV」切换为「读者数 UV」（微信读书/Wattpad 口径）。
CREATE TABLE "novel_reads" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "novel_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novel_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "novel_reads_user_id_novel_id_key" ON "novel_reads"("user_id", "novel_id");

CREATE INDEX "novel_reads_novel_id_idx" ON "novel_reads"("novel_id");

ALTER TABLE "novel_reads" ADD CONSTRAINT "novel_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "novel_reads" ADD CONSTRAINT "novel_reads_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 历史回填：从云端书架取「实际打开过章节」（chapter_id 非空，排除仅加书架未读）
-- 的 用户×作品 去重组合；id 用 md5 派生保证幂等唯一。
INSERT INTO "novel_reads" ("id", "user_id", "novel_id", "created_at")
SELECT substr(md5("user_id" || ':' || "novel_id"), 1, 32), "user_id", "novel_id", MIN("added_at")
FROM "reading_progress"
WHERE "chapter_id" IS NOT NULL
GROUP BY "user_id", "novel_id"
ON CONFLICT DO NOTHING;

-- viewCount 重新校准为读者数：以 novel_reads 计数覆盖旧 PV 值。
UPDATE "novels" n SET "view_count" = (
    SELECT count(*)::int FROM "novel_reads" r WHERE r."novel_id" = n."id"
);
