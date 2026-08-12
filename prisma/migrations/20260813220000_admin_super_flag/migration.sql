-- 超级管理标记：唯一超级管理账号（admin@chevoink.local），仅超级管理可在后台设置用户身份
ALTER TABLE "users" ADD COLUMN "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" SET "is_super_admin" = true WHERE "email" = 'admin@chevoink.local';
