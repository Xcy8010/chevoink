-- 私信分享专属卡片：MessageType 枚举增加 authorCard（作者卡片）与 commentCard（评论卡片）
ALTER TYPE "public"."MessageType" ADD VALUE IF NOT EXISTS 'authorCard';
ALTER TYPE "public"."MessageType" ADD VALUE IF NOT EXISTS 'commentCard';
