-- 会话令牌版本号：v2 会话令牌内嵌该值，改密/登出/封禁时 +1 即刻吊销全部旧令牌
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
