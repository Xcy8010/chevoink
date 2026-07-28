-- 私信支持发送图片：MessageType 枚举增加 image（内容存储为 /api/uploads/message-images/ 下的图片地址）
ALTER TYPE "public"."MessageType" ADD VALUE IF NOT EXISTS 'image';
