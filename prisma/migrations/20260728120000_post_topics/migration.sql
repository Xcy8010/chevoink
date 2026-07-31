-- 帖子-话题多对多关联表（方案 18 §3）：# 解析出的话题全部落这里，posts.topic_id 保留主话题兼容旧链路
CREATE TABLE "post_topics" (
    "id" VARCHAR(64) NOT NULL,
    "post_id" VARCHAR(64) NOT NULL,
    "topic_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_topics_post_id_topic_id_key" ON "post_topics"("post_id", "topic_id");

CREATE INDEX "post_topics_topic_id_idx" ON "post_topics"("topic_id");

ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 回填：存量帖子的单话题写入关联表（created_at 沿用帖子发布时间，保证近 7 天趋势统计口径一致）
INSERT INTO "post_topics" ("id", "post_id", "topic_id", "created_at")
SELECT concat('ptp_', p."id"), p."id", p."topic_id", p."created_at"
FROM "posts" p
WHERE p."topic_id" IS NOT NULL
ON CONFLICT DO NOTHING;
