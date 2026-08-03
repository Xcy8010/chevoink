-- 作品发布状态新增「已完结」：completed 与 archived（已下架）语义分离，
-- 完结榜只认 completed
ALTER TYPE "NovelStatus" ADD VALUE IF NOT EXISTS 'completed';
