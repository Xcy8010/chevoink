-- 列表查询补索引：全部为增量 CREATE INDEX，无数据变更、无破坏性操作
-- novels：书城列表（status+visibility 过滤 + lastPublishedAt 排序）、作者主页作品（updatedAt 排序）
CREATE INDEX "novels_status_visibility_last_published_at_idx" ON "public"."novels"("status", "visibility", "last_published_at");
CREATE INDEX "novels_author_id_updated_at_idx" ON "public"."novels"("author_id", "updated_at");

-- comments：评论区按时间正序分页
CREATE INDEX "comments_target_type_target_id_created_at_idx" ON "public"."comments"("target_type", "target_id", "created_at");

-- posts：社区 feed 按 createdAt 排序、话题页与作者主页帖子列表
CREATE INDEX "posts_created_at_idx" ON "public"."posts"("created_at");
CREATE INDEX "posts_topic_id_created_at_idx" ON "public"."posts"("topic_id", "created_at");
CREATE INDEX "posts_user_id_created_at_idx" ON "public"."posts"("user_id", "created_at");
