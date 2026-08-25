CREATE TABLE "volumes" (
  "id" VARCHAR(64) NOT NULL,
  "novel_id" VARCHAR(64) NOT NULL,
  "title" VARCHAR(128) NOT NULL,
  "summary" TEXT,
  "order_index" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "volumes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "volumes_novel_id_order_index_key"
ON "volumes"("novel_id", "order_index");

CREATE INDEX "volumes_novel_id_idx" ON "volumes"("novel_id");

ALTER TABLE "volumes"
ADD CONSTRAINT "volumes_novel_id_fkey"
FOREIGN KEY ("novel_id") REFERENCES "novels"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "volumes" (
  "id",
  "novel_id",
  "title",
  "summary",
  "order_index",
  "revision",
  "created_at",
  "updated_at"
)
SELECT
  'vol_' || SUBSTRING(MD5("id") FROM 1 FOR 24),
  "id",
  '第一卷',
  NULL,
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "novels";

ALTER TABLE "chapters"
ADD COLUMN "volume_id" VARCHAR(64),
ADD COLUMN "order_in_volume" INTEGER;

UPDATE "chapters" AS chapter
SET
  "volume_id" = volume."id",
  "order_in_volume" = chapter."order_index"
FROM "volumes" AS volume
WHERE volume."novel_id" = chapter."novel_id"
  AND volume."order_index" = 1;

ALTER TABLE "chapters"
ALTER COLUMN "volume_id" SET NOT NULL,
ALTER COLUMN "order_in_volume" SET NOT NULL;

CREATE UNIQUE INDEX "chapters_volume_id_order_in_volume_key"
ON "chapters"("volume_id", "order_in_volume");

CREATE INDEX "chapters_volume_id_order_in_volume_idx"
ON "chapters"("volume_id", "order_in_volume");

ALTER TABLE "chapters"
ADD CONSTRAINT "chapters_volume_id_fkey"
FOREIGN KEY ("volume_id") REFERENCES "volumes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
