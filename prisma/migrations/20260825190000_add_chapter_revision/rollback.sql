-- 仅供停服、确认旧版本不读取 revision 且已有完整备份时手工执行。
ALTER TABLE "chapters" DROP COLUMN IF EXISTS "revision";
