ALTER TABLE "novels" ADD COLUMN "pinned_at" TIMESTAMP(3);
CREATE INDEX "novels_author_id_pinned_at_idx" ON "novels"("author_id", "pinned_at");
