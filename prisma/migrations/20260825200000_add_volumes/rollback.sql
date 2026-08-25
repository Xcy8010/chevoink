-- 手工回滚脚本（仅用于发布回滚演练；Prisma migrate deploy 不会自动执行）。
-- 回滚前必须确认应用版本已降回不读取 volume_id/order_in_volume 的版本。
ALTER TABLE "chapters" DROP CONSTRAINT IF EXISTS "chapters_volume_id_fkey";
DROP INDEX IF EXISTS "chapters_volume_id_order_in_volume_key";
DROP INDEX IF EXISTS "chapters_volume_id_order_in_volume_idx";
ALTER TABLE "chapters" DROP COLUMN IF EXISTS "order_in_volume";
ALTER TABLE "chapters" DROP COLUMN IF EXISTS "volume_id";
DROP TABLE IF EXISTS "volumes";
