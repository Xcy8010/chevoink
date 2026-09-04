-- Remove only exact duplicate compaction inputs before enforcing cross-instance idempotency.
DELETE FROM "context_checkpoints" AS duplicate
USING "context_checkpoints" AS canonical
WHERE duplicate."session_id" = canonical."session_id"
  AND duplicate."source_hash" = canonical."source_hash"
  AND (
    duplicate."created_at" > canonical."created_at"
    OR (duplicate."created_at" = canonical."created_at" AND duplicate."id" > canonical."id")
  );

CREATE UNIQUE INDEX "context_checkpoints_session_id_source_hash_key"
ON "context_checkpoints"("session_id", "source_hash");
