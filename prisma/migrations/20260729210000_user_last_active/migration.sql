-- 在线状态：记录用户最近一次带登录态的 API 请求时间，5 分钟内视为在线
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3);
