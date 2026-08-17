-- 推荐行为事件表（推荐算法优化方案 Phase 1）：
-- 统一记录曝光/点击/开始阅读/进度/收藏/完读/弃读/不感兴趣等事件；
-- 客户端生成 event_id 幂等去重，服务端入库唯一跳过；
-- 只保留作品/用户/行为元数据，不保留正文内容（隐私优先）。
CREATE TABLE "recommendation_events" (
    "id" VARCHAR(64) NOT NULL,
    "event_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64),
    "novel_id" VARCHAR(64) NOT NULL,
    "surface" VARCHAR(32) NOT NULL,
    "position" INTEGER,
    "event_type" VARCHAR(32) NOT NULL,
    "dwell_ms" INTEGER,
    "progress_percent" DOUBLE PRECISION,
    "session_id" VARCHAR(64),
    "algorithm_version" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recommendation_events_event_id_key" ON "recommendation_events"("event_id");

CREATE INDEX "recommendation_events_user_id_created_at_idx" ON "recommendation_events"("user_id", "created_at");

CREATE INDEX "recommendation_events_novel_id_event_type_idx" ON "recommendation_events"("novel_id", "event_type");

ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
