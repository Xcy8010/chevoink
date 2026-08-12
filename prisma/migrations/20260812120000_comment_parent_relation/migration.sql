-- 评论自关联（parent/replies）：支持「回复了我的评论」互动消息按父评论作者查询
-- 先清理历史孤儿 parent_id（父评论已不存在的回复），保证外键可建立
UPDATE "comments" c
SET "parent_id" = NULL
WHERE c."parent_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "comments" p WHERE p."id" = c."parent_id");

-- AddForeignKey
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "comments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
